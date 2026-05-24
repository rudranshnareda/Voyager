"""Step 1: verify groq imports work in groq 1.x"""
print("Testing groq 1.x imports...")
import groq
print("groq version:", groq.__version__)

# Check what exception classes are available
print("APIError:", hasattr(groq, 'APIError'))
print("APIStatusError:", hasattr(groq, 'APIStatusError'))
print("APIConnectionError:", hasattr(groq, 'APIConnectionError'))
print("RateLimitError:", hasattr(groq, 'RateLimitError'))

print("\nTesting client init...")
import os
from dotenv import load_dotenv
load_dotenv()
client = groq.Groq(api_key=os.getenv("GROQ_API_KEY"))
print("Client created:", type(client))

print("\nCalling API...")
resp = client.chat.completions.create(
    model="llama-3.1-70b-versatile",
    messages=[{"role": "user", "content": "Say: pong"}],
    max_tokens=10,
)
print("Response:", resp.choices[0].message.content)
print("Import + API test OK.")
