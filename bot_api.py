import logging
import aiohttp
import asyncio
from config import BOT_API_BASE_URL, BOT_API_SECRET

logger = logging.getLogger(__name__)

async def check_backend_connection() -> dict:
    """
    Checks the connection to the Express Webapp backend.
    Returns a dict with check details:
    {
        "success": bool,
        "message": str,
        "service": str or None,
        "api_version": str or None
    }
    """
    if not BOT_API_SECRET:
        return {
            "success": False,
            "message": "BOT_API_SECRET is not configured",
            "service": None,
            "api_version": None
        }

    url = f"{BOT_API_BASE_URL.rstrip('/')}/api/bot/health"
    headers = {
        "X-Bot-Token": BOT_API_SECRET
    }

    try:
        # Timeout of 5 seconds
        timeout = aiohttp.ClientTimeout(total=5.0)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.get(url, headers=headers) as response:
                if response.status == 200:
                    try:
                        data = await response.json()
                        if data.get("status") == "ok":
                            return {
                                "success": True,
                                "message": "Successfully connected to backend",
                                "service": data.get("service"),
                                "api_version": data.get("api_version")
                            }
                        else:
                            return {
                                "success": False,
                                "message": f"Unexpected backend response format: {data}",
                                "service": None,
                                "api_version": None
                            }
                    except Exception as e:
                        return {
                            "success": False,
                            "message": f"Failed to parse JSON from backend: {str(e)}",
                            "service": None,
                            "api_version": None
                        }
                elif response.status == 401:
                    return {
                        "success": False,
                        "message": "Backend authorization failed (401 Unauthorized)",
                        "service": None,
                        "api_version": None
                    }
                elif response.status == 503:
                    return {
                        "success": False,
                        "message": "Backend API service is unavailable or secret not set (503 Service Unavailable)",
                        "service": None,
                        "api_version": None
                    }
                else:
                    return {
                        "success": False,
                        "message": f"Backend returned unexpected status code: {response.status}",
                        "service": None,
                        "api_version": None
                    }
    except asyncio.TimeoutError:
        return {
            "success": False,
            "message": "Connection timed out after 5.0 seconds",
            "service": None,
            "api_version": None
        }
    except aiohttp.ClientError as e:
        return {
            "success": False,
            "message": f"Network / connection error: {str(e)}",
            "service": None,
            "api_version": None
        }
    except Exception as e:
        return {
            "success": False,
            "message": f"Unexpected error while checking backend: {str(e)}",
            "service": None,
            "api_version": None
        }
