// frontend/src/components/TrackList.js
import React from 'react';
import styled from 'styled-components';

const List = styled.ul`
  list-style: none;
  padding: 0;
  margin: 0;
`;

const ListItem = styled.li`
  padding: 10px;
  margin-bottom: 10px;
  background-color: #333;
  border-radius: 8px;
  display: flex;
  align-items: center;
  transition: background-color 0.2s;
  
  &:hover {
    background-color: #444;
  }
`;

const TrackImage = styled.img`
  width: 60px;
  height: 60px;
  border-radius: 4px;
  margin-right: 15px;
  object-fit: cover;
`;

const TrackInfo = styled.div`
  flex: 1;
`;

const TrackName = styled.div`
  font-weight: bold;
  margin-bottom: 5px;
`;

const TrackArtist = styled.div`
  font-size: 0.9em;
  color: #b3b3b3;
`;

const TrackAlbum = styled.div`
  font-size: 0.8em;
  color: #b3b3b3;
`;

// Use placeholder image when track image is missing
const DEFAULT_IMAGE = "https://via.placeholder.com/60?text=🎵";

function TrackList({ tracks }) {
  if (!tracks || tracks.length === 0) {
    return <p>No tracks available</p>;
  }
  
  return (
    <List>
      {tracks.map(track => (
        <ListItem key={track.id || `track-${Math.random()}`}>
          <TrackImage 
            src={track.image || DEFAULT_IMAGE} 
            alt={track.name} 
            onError={(e) => {e.target.src = DEFAULT_IMAGE}}
          />
          <TrackInfo>
            <TrackName>{track.name}</TrackName>
            <TrackArtist>{track.artist}</TrackArtist>
            <TrackAlbum>{track.album}</TrackAlbum>
          </TrackInfo>
        </ListItem>
      ))}
    </List>
  );
}

export default TrackList;