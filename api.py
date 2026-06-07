from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
import os
from dotenv import load_dotenv

load_dotenv()

from llama_index.core import (
    VectorStoreIndex,
    SimpleDirectoryReader,
    Settings,
    StorageContext,
    load_index_from_storage,
    PromptTemplate
)
from llama_index.llms.groq import Groq
from llama_index.embeddings.huggingface import HuggingFaceEmbedding
from duckduckgo_search import DDGS

# --- INITIALIZE LlamaIndex ---
print("Initializing Models...")
llm = Groq(model="llama-3.3-70b-versatile")
Settings.llm = llm
Settings.embed_model = HuggingFaceEmbedding(model_name="BAAI/bge-small-en-v1.5")

PERSIST_DIR = "./vector_store"

print("Loading Index...")
if not os.path.exists(os.path.join(PERSIST_DIR, "docstore.json")):
    print("Creating new index...")
    documents = SimpleDirectoryReader("data").load_data()
    index = VectorStoreIndex.from_documents(documents, show_progress=False)
    index.storage_context.persist(persist_dir=PERSIST_DIR)
else:
    print("Loading existing index...")
    storage_context = StorageContext.from_defaults(persist_dir=PERSIST_DIR)
    index = load_index_from_storage(storage_context)

# Custom Prompt
qa_prompt_tmpl_str = (
    "Context information is below.\n"
    "---------------------\n"
    "{context_str}\n"
    "---------------------\n"
    "Given the context information and not prior knowledge, answer the query.\n"
    "If the answer is not contained within the context, you MUST exactly output ONLY the word 'NOT_FOUND'.\n"
    "Query: {query_str}\n"
    "Answer: "
)
qa_prompt_tmpl = PromptTemplate(qa_prompt_tmpl_str)
query_engine = index.as_query_engine(text_qa_template=qa_prompt_tmpl)

# --- FASTAPI APP ---
app = FastAPI(title="Pulse 360 RAG API")

# Enable CORS for the React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Allow all origins for dev
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ChatRequest(BaseModel):
    question: str

class ChatResponse(BaseModel):
    answer: str
    source: str

@app.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    question = request.question
    
    try:
        # Step 1: Query RAG
        response = query_engine.query(question)
        response_text = str(response).strip()

        if "NOT_FOUND" in response_text:
            # Step 2: Fallback to Web Search
            search_results = []
            try:
                with DDGS() as ddgs:
                    search_results = list(ddgs.text(question, max_results=3))
            except Exception:
                pass # Silently handle DuckDuckGo blocking/errors
            
            if search_results:
                context = "\n".join([f"- {r['body']}" for r in search_results])
                web_prompt = (
                    f"Using the following internet search results, answer the user's question.\n\n"
                    f"Search Results:\n{context}\n\n"
                    f"Question: {question}\n"
                    f"Answer:"
                )
                final_response = llm.complete(web_prompt)
                return ChatResponse(answer=final_response.text, source="Web Search")
            else:
                # Step 3: Fallback to LLM's General Knowledge if Web Search fails
                general_prompt = f"Please answer the following question based on your general knowledge: {question}\nAnswer:"
                final_response = llm.complete(general_prompt)
                return ChatResponse(answer=final_response.text, source="General Knowledge")
        else:
            return ChatResponse(answer=response_text, source="Pulse 360 Document")
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
