// frontend/src/components/SpotifyWebPlayer.js
import React, { useState, useEffect } from 'react';
import styled from 'styled-components';

const PlayerContainer = styled.div`
  padding: 10px 20px;
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const ErrorMessage = styled.div`
  color: #ff6b6b;
  text-align: center;
`;

const PlayButton = styled.button`
  background-color: #1db954;
  color: white;
  border: none;
  border-radius: 50%;
  width: 40px;
  height: 40px;
  font-size: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 15px;
  cursor: pointer;
  
  &:hover {
    background-color: #1ed760;
    transform: scale(1.05);
  }
`;

const TrackInfo = styled.div`
  margin-left: 15px;
  flex: 1;
`;

const TrackName = styled.div`
  font-weight: bold;
  margin-bottom: 3px;
`;

const TrackArtist = styled.div`
  font-size: 0.9em;
  color: #b3b3b3;
`;

const PlayerControls = styled.div`
  display: flex;
  align-items: center;
`;

const ControlButton = styled.button`
  background: none;
  border: none;
  color: #b3b3b3;
  font-size: 18px;
  cursor: pointer;
  padding: 0 15px;
  
  &:hover {
    color: white;
  }
  
  &:disabled {
    color: #535353;
    cursor: not-allowed;
  }
`;

// Note: This is a simplified player. In a real application, you would use the 
// Spotify Web Playback SDK which requires premium subscription
function SpotifyWebPlayer({ token, uris }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [error, setError] = useState(null);
  const [currentTrack, setCurrentTrack] = useState(null);

  useEffect(() => {
    // In a real app, you would initialize Spotify Web Playback SDK here
    // For this prototype, we'll just simulate the player state
    
    if (uris && uris.length > 0) {
      // Get the first track info
      const uri = uris[0];
      const trackId = uri.split(':').pop();
      
      // In a real app, you would get track details from the SDK
      // For our prototype, we'll just set the current track display
      setCurrentTrack({
        id: trackId,
        name: "Track Preview",
        artist: "Preview Only"
      });
    }
    
    return () => {
      // Cleanup player in a real app
    };
  }, [uris]);

  useEffect(() => {
    if (uris && uris.length > 0 && currentTrackIndex < uris.length) {
      const uri = uris[currentTrackIndex];
      const trackId = uri.split(':').pop();
      
      // Update current track info
      setCurrentTrack({
        id: trackId,
        name: `Track ${currentTrackIndex + 1} Preview`,
        artist: "Preview Only"
      });
    }
  }, [currentTrackIndex, uris]);

  const togglePlay = () => {
    // In a real app, this would control the Spotify playback
    setIsPlaying(!isPlaying);
  };

  const nextTrack = () => {
    if (currentTrackIndex < uris.length - 1) {
      setCurrentTrackIndex(currentTrackIndex + 1);
    }
  };

  const prevTrack = () => {
    if (currentTrackIndex > 0) {
      setCurrentTrackIndex(currentTrackIndex - 1);
    }
  };

  if (error) {
    return <ErrorMessage>{error}</ErrorMessage>;
  }

  if (!uris || uris.length === 0) {
    return null;
  }

  return (
    <PlayerContainer>
      <PlayerControls>
        <ControlButton onClick={prevTrack} disabled={currentTrackIndex === 0}>⏮</ControlButton>
        <PlayButton onClick={togglePlay}>
          {isPlaying ? '⏸' : '▶'}
        </PlayButton>
        <ControlButton onClick={nextTrack} disabled={currentTrackIndex === uris.length - 1}>⏭</ControlButton>
      </PlayerControls>
      
      <TrackInfo>
        <TrackName>{currentTrack?.name || 'Loading...'}</TrackName>
        <TrackArtist>{currentTrack?.artist || ''}</TrackArtist>
      </TrackInfo>
      
      <div style={{ color: '#b3b3b3', fontSize: '0.8em' }}>
        Note: Full playback requires Spotify Premium
      </div>
    </PlayerContainer>
  );
}

export default SpotifyWebPlayer;