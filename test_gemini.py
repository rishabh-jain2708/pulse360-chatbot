import os
from dotenv import load_dotenv

load_dotenv()

print("Key:", os.getenv("GOOGLE_API_KEY"))