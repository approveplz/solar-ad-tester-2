import React from 'react';
function VideoPreviewPlayer({ videoUrl }) {
    // Check if the URL is from Google Drive
    if (videoUrl && videoUrl.includes('drive.google.com')) {
        const extractFileIdFromGDriveDownloadUrl = (url) => {
            try {
                const queryString = url.split('?')[1];
                const urlParams = new URLSearchParams(queryString);
                return urlParams.get('id');
            } catch (error) {
                console.error('Error extracting file ID from URL:', error);
                return null;
            }
        };

        const fileId = extractFileIdFromGDriveDownloadUrl(videoUrl);
        // Create the embed URL for Google Drive to allow inline playback
        const embedUrl = fileId
            ? `https://drive.google.com/file/d/${fileId}/preview`
            : videoUrl;

        return (
            <iframe
                title="Video Preview"
                src={embedUrl}
                width="100%"
                height="250"
                allow="autoplay"
            >
                Your browser does not support iframes.
            </iframe>
        );
    } else {
        // For non–Google Drive videos, use the HTML5 video element
        return (
            <video
                controls
                style={{ width: '100%', maxHeight: '250px' }}
                src={videoUrl}
            >
                Your browser does not support the video tag.
            </video>
        );
    }
}

export default VideoPreviewPlayer;
