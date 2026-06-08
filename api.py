from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
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

# Global variables for models (loaded during startup)
llm = None
query_engine = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    # --- Runs AFTER the server binds to the port ---
    global llm, query_engine

    print("Initializing Models...")
    llm = Groq(model="llama-3.3-70b-versatile")
    Settings.llm = llm
    Settings.embed_model = HuggingFaceEmbedding(model_name="BAAI/bge-small-en-v1.5")

    PERSIST_DIR = "./vector_store"
    print("Loading Index...")
    if not os.path.exists(os.path.join(PERSIST_DIR, "docstore.json")):
        print("Creating new index from documents...")
        documents = SimpleDirectoryReader("data").load_data()
        index = VectorStoreIndex.from_documents(documents, show_progress=False)
        index.storage_context.persist(persist_dir=PERSIST_DIR)
    else:
        print("Loading existing index...")
        storage_context = StorageContext.from_defaults(persist_dir=PERSIST_DIR)
        index = load_index_from_storage(storage_context)

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
    print("Models ready!")

    yield  # Server is live here

    # Cleanup (if needed)
    print("Shutting down...")


# --- FASTAPI APP ---
app = FastAPI(title="Pulse 360 RAG API", lifespan=lifespan)

# Enable CORS for the React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ChatRequest(BaseModel):
    question: str

class ChatResponse(BaseModel):
    answer: str
    source: str

@app.get("/")
async def root():
    return {"status": "Pulse 360 API is running"}

@app.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    if query_engine is None or llm is None:
        raise HTTPException(status_code=503, detail="Models are still loading, please try again in a moment.")

    question = request.question

    try:
        # Step 1: Query RAG
        response = query_engine.query(question)
        response_text = str(response).strip()

        if "NOT_FOUND" in response_text:
            # Step 2: Fallback to Web Search with improved query
            search_results = []
            try:
                with DDGS() as ddgs:
                    # Use more results and a news search for financial/current data
                    search_results = list(ddgs.text(question, max_results=5))
            except Exception:
                pass  # Silently handle DuckDuckGo blocking/errors

            if search_results:
                # Filter out very short/useless snippets
                useful_results = [r for r in search_results if len(r.get('body', '')) > 50]
                if not useful_results:
                    useful_results = search_results

                context = "\n".join([
                    f"Source: {r.get('href', 'Unknown')}\nContent: {r['body']}"
                    for r in useful_results
                ])
                web_prompt = (
                    f"You are a helpful assistant. Use the following web search results to answer the user's question as specifically and accurately as possible.\n"
                    f"If the search results contain relevant numbers, statistics, or facts, include them in your answer.\n"
                    f"If the results are not relevant enough, say so and provide any related context you know.\n\n"
                    f"Search Results:\n{context}\n\n"
                    f"Question: {question}\n"
                    f"Answer:"
                )
                final_response = llm.complete(web_prompt)
                return ChatResponse(answer=final_response.text, source="Web Search")
            else:
                # Step 3: Fallback to LLM General Knowledge
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
