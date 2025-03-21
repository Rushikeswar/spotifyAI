import axios from "axios";

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';
export const refreshToken = async () => {
  const storedRefreshToken = localStorage.getItem("spotify_refresh_token");
  const storedSessionId = localStorage.getItem("session_id");
  const tokenExpiry = localStorage.getItem("token_expiry");

  // ✅ Check if token is still valid before making an API call
  if (tokenExpiry && Date.now() < tokenExpiry) {
    console.log("Token still valid, no need to refresh.");
    return localStorage.getItem("spotify_token");
  }

  if (!storedRefreshToken || !storedSessionId) {
    console.error("Missing refresh token or session ID, logging out...");
    handleLogout();
    return null;
  }

  try {
    console.log("Refreshing Spotify token...");
    const response = await axios.post(`${API_URL}/api/spotify/refresh`, {
      refreshToken: storedRefreshToken,
      sessionId: storedSessionId,
    });

    if (response.data.accessToken) {
      const newToken = response.data.accessToken;
      const expiresIn = response.data.expiresIn || 3600; // Default to 1 hour
      const expiryTime = Date.now() + expiresIn * 1000;

      localStorage.setItem("spotify_token", newToken);
      localStorage.setItem("token_expiry", expiryTime);

      console.log("Spotify token refreshed successfully.");
      return newToken;
    } else {
      throw new Error("No access token received during refresh.");
    }
  } catch (error) {
    console.error("Spotify token refresh failed:", error);
    handleLogout();
    return null;
  }
};
