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

print("Step 1: Imports loaded")

# Setup Models
llm = Groq(model="llama-3.3-70b-versatile")
Settings.llm = llm
Settings.embed_model = HuggingFaceEmbedding(model_name="BAAI/bge-small-en-v1.5")
print("Step 2: Models configured")

PERSIST_DIR = "./vector_store"

# Load or Create Index
if not os.path.exists(os.path.join(PERSIST_DIR, "docstore.json")):
    print("Step 3: Creating new index from documents...")
    documents = SimpleDirectoryReader("data").load_data()
    index = VectorStoreIndex.from_documents(documents, show_progress=True)
    index.storage_context.persist(persist_dir=PERSIST_DIR)
else:
    print("Step 3: Loading existing index from storage...")
    storage_context = StorageContext.from_defaults(persist_dir=PERSIST_DIR)
    index = load_index_from_storage(storage_context)

print("Step 4: Index ready")

# Define a custom prompt to force "NOT_FOUND" if the answer isn't in the PDF
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
print("Step 5: Query engine created with strict context routing")

while True:
    question = input("\nAsk a question (type exit to quit): ")
    if question.lower() == "exit":
        break

    try:
        # Step 1: Try to answer from the Document (RAG)
        response = query_engine.query(question)
        response_text = str(response).strip()

        if "NOT_FOUND" in response_text:
            print("\n[!] Answer not found in documents. Searching the internet...")
            
            # Step 2: Search the internet (Fallback)
            with DDGS() as ddgs:
                search_results = list(ddgs.text(question, max_results=3))
            
            if search_results:
                # Step 3: Use AI to fine-tune and answer from the web search results
                context = "\n".join([f"- {r['body']}" for r in search_results])
                web_prompt = (
                    f"Using the following internet search results, answer the user's question.\n\n"
                    f"Search Results:\n{context}\n\n"
                    f"Question: {question}\n"
                    f"Answer:"
                )
                
                final_response = llm.complete(web_prompt)
                print("\nAnswer (from Web Search):")
                print(final_response.text)
            else:
                print("\nAnswer: Could not find an answer in the documents or on the internet.")
        else:
            print("\nAnswer (from Document):")
            print(response_text)

    except Exception as e:
        print(f"\nAn error occurred while querying: {e}")