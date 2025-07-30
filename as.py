import requests
import json

def test_llama_api():
    """
    Quick test script to send a request to the Llama API
    """
    
    # API endpoint (from your code)
    url = "https://ai.hackclub.com/chat/completions"
    
    # Headers
    headers = {
        "Content-Type": "application/json"
    }
    
    # Test message
    test_message = "Hello! This is a test message. Can you respond briefly?"
    
    # Payload structure (matching your code format)
    payload = {
        "messages": [
            {
                "role": "user", 
                "content": test_message
            }
        ]
    }
    
    try:
        print(f"Sending test message: '{test_message}'")
        print("Making API request...")
        
        # Send the request
        response = requests.post(url, headers=headers, data=json.dumps(payload))
        
        # Check if request was successful
        response.raise_for_status()
        
        # Parse the response
        response_data = response.json()
        
        # Extract the content (matching your code structure)
        if "choices" in response_data and len(response_data["choices"]) > 0:
            ai_response = response_data["choices"][0]["message"]["content"]
            print(f"\n✅ Success! Llama responded:")
            print(f"Response: {ai_response}")
        else:
            print("❌ Unexpected response format:")
            print(json.dumps(response_data, indent=2))
            
    except requests.exceptions.RequestException as e:
        print(f"❌ Request failed: {str(e)}")
        if hasattr(e, 'response') and e.response is not None:
            print(f"Status code: {e.response.status_code}")
            print(f"Response text: {e.response.text}")
    
    except json.JSONDecodeError as e:
        print(f"❌ Failed to parse JSON response: {str(e)}")
    
    except Exception as e:
        print(f"❌ Unexpected error: {str(e)}")

def test_with_custom_message():
    """
    Test with a custom message
    """
    custom_message = input("Enter your test message (or press Enter for default): ").strip()
    
    if not custom_message:
        test_llama_api()
        return
    
    url = "https://ai.hackclub.com/chat/completions"
    headers = {"Content-Type": "application/json"}
    payload = {
        "messages": [{"role": "user", "content": custom_message}]
    }
    
    try:
        print(f"Sending: '{custom_message}'")
        response = requests.post(url, headers=headers, data=json.dumps(payload))
        response.raise_for_status()
        
        ai_response = response.json()["choices"][0]["message"]["content"]
        print(f"\n✅ Llama responded: {ai_response}")
        
    except Exception as e:
        print(f"❌ Error: {str(e)}")

if __name__ == "__main__":
    print("🦙 Llama API Test Script")
    print("=" * 30)
    
    # Run basic test
    test_llama_api()
    
    print("\n" + "=" * 30)
    
    # Ask if user wants to test with custom message
    if input("Want to test with a custom message? (y/n): ").lower().startswith('y'):
        test_with_custom_message()