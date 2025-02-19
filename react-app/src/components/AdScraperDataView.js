import React, { useState, useEffect, useRef, useCallback } from 'react';
import VideoPreviewPlayer from './VideoPreviewPlayer';
import {
    getScrapedAdsFirestoreAll,
    deleteScrapedAdFirestore,
    saveScrapedAdFirestore,
} from '../firebase';
import { getCosineSimilarity } from '../helpers';

function UnprocessedVideoCard({
    videoDataItem,
    allVideoData,
    onConfirmDuplicate,
    onNotADuplicate,
    onUseAsAd,
    onDontUseAsAd,
    onSave,
}) {
    const { scrapedAdDataFirestore, uiState } = videoDataItem;

    const cardStyle = {
        border: '1px solid #ccc',
        borderRadius: '8px',
        padding: '16px',
        marginBottom: '16px',
        boxShadow: '0 2px 5px rgba(0,0,0,0.1)',
    };

    const buttonStyle = {
        marginRight: '8px',
        padding: '8px 12px',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer',
    };

    const previewContainerStyle = {
        display: 'flex',
        gap: '16px',
        marginBottom: '16px',
    };

    const getDuplicateVideoUrl = (duplicateId) => {
        const duplicateVideoItem = allVideoData.find(
            (v) => v.scrapedAdDataFirestore.videoIdentifier === duplicateId
        );
        return duplicateVideoItem?.scrapedAdDataFirestore.url || '';
    };

    return (
        <div style={cardStyle}>
            <div style={previewContainerStyle}>
                <div style={{ flex: 1 }}>
                    <h4>Original Video</h4>
                    <VideoPreviewPlayer videoUrl={scrapedAdDataFirestore.url} />
                    <p>
                        <strong>Video ID:</strong> <br />
                        {scrapedAdDataFirestore.videoIdentifier}
                    </p>
                    <p>
                        <strong>Formatted Start Time:</strong> <br />
                        {scrapedAdDataFirestore.formattedStartTime}
                    </p>

                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            marginBottom: '8px',
                        }}
                    >
                        {uiState.isDuplicateHandled ? (
                            <span
                                style={{
                                    backgroundColor: '#28a745',
                                    color: '#fff',
                                    padding: '8px 12px',
                                    borderRadius: '4px',
                                }}
                            >
                                Confirmed{' '}
                                <span style={{ marginLeft: '4px' }}>✓</span>
                            </span>
                        ) : (
                            <>
                                <button
                                    onClick={() =>
                                        onConfirmDuplicate(
                                            scrapedAdDataFirestore.videoIdentifier,
                                            uiState.nearestNeighbors[0]
                                                .videoIdentifier
                                        )
                                    }
                                    style={{
                                        ...buttonStyle,
                                        backgroundColor: '#007BFF',
                                        color: '#fff',
                                        marginRight: '8px',
                                        cursor: 'pointer',
                                    }}
                                >
                                    Confirm Duplicate (Top)
                                </button>
                                <button
                                    onClick={() =>
                                        onConfirmDuplicate(
                                            scrapedAdDataFirestore.videoIdentifier,
                                            uiState.nearestNeighbors[1]
                                                .videoIdentifier
                                        )
                                    }
                                    style={{
                                        ...buttonStyle,
                                        backgroundColor: '#007BFF',
                                        color: '#fff',
                                        marginRight: '8px',
                                        cursor: 'pointer',
                                    }}
                                >
                                    Confirm Duplicate (Bottom)
                                </button>
                                <button
                                    onClick={() =>
                                        onNotADuplicate(
                                            scrapedAdDataFirestore.videoIdentifier
                                        )
                                    }
                                    style={{
                                        ...buttonStyle,
                                        backgroundColor: '#6c757d',
                                        color: '#fff',
                                    }}
                                >
                                    Not a Duplicate
                                </button>
                            </>
                        )}
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                            onClick={() =>
                                onUseAsAd(
                                    scrapedAdDataFirestore.videoIdentifier
                                )
                            }
                            style={{
                                ...buttonStyle,
                                backgroundColor: 'green',
                                color: '#fff',
                            }}
                        >
                            Use as Ad
                        </button>
                        <button
                            onClick={() =>
                                onDontUseAsAd(
                                    scrapedAdDataFirestore.videoIdentifier
                                )
                            }
                            style={{
                                ...buttonStyle,
                                backgroundColor: 'red',
                                color: '#fff',
                            }}
                        >
                            Don't Use as Ad
                        </button>
                    </div>
                    <div style={{ marginTop: '12px' }}>
                        <button
                            onClick={onSave}
                            style={{
                                ...buttonStyle,
                                backgroundColor: '#007BFF',
                                color: '#fff',
                            }}
                        >
                            Save
                        </button>
                    </div>
                </div>
                <div style={{ flex: 1 }}>
                    <h4>Potential Duplicates</h4>
                    <div
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '16px',
                        }}
                    >
                        {uiState.nearestNeighbors.map((neighbor) => (
                            <div
                                key={neighbor.videoIdentifier}
                                style={{
                                    border: '1px solid #ccc',
                                    borderRadius: '4px',
                                    padding: '16px',
                                }}
                            >
                                <VideoPreviewPlayer
                                    videoUrl={getDuplicateVideoUrl(
                                        neighbor.videoIdentifier
                                    )}
                                />
                                <p>
                                    <strong>Duplicate Video ID:</strong>
                                    <br />
                                    {neighbor.videoIdentifier}
                                </p>
                                <p>
                                    <strong>Processed:</strong>
                                    <br />
                                    {neighbor.processed ? 'Yes' : 'No'}
                                </p>
                                <p>
                                    <strong>Similarity Score:</strong>
                                    <br />
                                    {neighbor.similarityScore}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

function ArchiveVideoCard({ video }) {
    const cardStyle = {
        border: '1px solid #ccc',
        borderRadius: '8px',
        padding: '16px',
        marginBottom: '16px',
        boxShadow: '0 2px 5px rgba(0,0,0,0.1)',
    };

    return (
        <div style={cardStyle}>
            <VideoPreviewPlayer videoUrl={video.url} />
            <p>
                <strong>Video ID:</strong> {video.videoIdentifier}
            </p>
            <strong>Duplicate Video IDs:</strong>
            <ul>
                {video.duplicateVideoIdentifiers.map((id) => (
                    <li key={id}>{id}</li>
                ))}
            </ul>
            <p>
                <strong>Formatted Start Time:</strong>{' '}
                {video.formattedStartTime}
            </p>
            <p>
                <strong>Used for FB ad:</strong>{' '}
                {video.isUsedForAd ? 'Yes' : 'No'}
            </p>
            <p>
                <strong>Company:</strong> {video.pageName}
            </p>
        </div>
    );
}

function AdScraperDataView() {
    const [videoData, setVideoData] = useState([]);
    const videoIdentifiersToDelete = useRef([]);
    const videoIdentifiersToUpdate = useRef({});

    const getNearestNeighbors = (firestoreData, scrapedAdsFirestore, topK) => {
        const currentEmbedding = firestoreData.descriptionEmbedding;
        const neighbors = scrapedAdsFirestore.map((scrapedAd) => {
            const similarityScore = getCosineSimilarity(
                currentEmbedding,
                scrapedAd.descriptionEmbedding
            );
            return {
                similarityScore,
                videoIdentifier: scrapedAd.videoIdentifier,
                processed: scrapedAd.processed,
            };
        });

        neighbors.sort((a, b) => {
            const scoreDiff = b.similarityScore - a.similarityScore;
            if (Math.abs(scoreDiff) < 0.05) {
                // If similarity scores are nearly equal (difference less than 0.05),
                // prioritize items with processed === true.
                if (a.processed === b.processed) {
                    return 0;
                }
                return a.processed ? -1 : 1;
            }
            return scoreDiff;
        });

        return neighbors.slice(0, topK);
    };

    // Extract the data fetching logic into its own function.
    const loadData = useCallback(async () => {
        const scrapedAdsFirestore = await getScrapedAdsFirestoreAll();
        const combinedData = scrapedAdsFirestore.map((firestoreData) => {
            const nearestNeighbors = getNearestNeighbors(
                firestoreData,
                scrapedAdsFirestore,
                2
            );

            const nearestNeighborsVideoIdentifiers = nearestNeighbors.map(
                (neighbor) => ({
                    videoIdentifier: neighbor.videoIdentifier,
                    processed: neighbor.processed,
                    similarityScore: neighbor.similarityScore,
                })
            );
            return {
                scrapedAdDataFirestore: firestoreData,
                uiState: {
                    isDuplicateHandled: false,
                    nearestNeighbors: nearestNeighborsVideoIdentifiers,
                },
            };
        });
        setVideoData(combinedData);
    }, []);

    // Call loadData when the component mounts.
    useEffect(() => {
        loadData();
    }, [loadData]);

    const handleConfirmDuplicate = (
        videoIdentifier,
        duplicateVideoIdentifier
    ) => {
        videoIdentifiersToDelete.current.push(videoIdentifier);

        const updatedDuplicateScrapedAdDataFirestore = structuredClone(
            videoData.find(
                (item) =>
                    item.scrapedAdDataFirestore.videoIdentifier ===
                    duplicateVideoIdentifier
            ).scrapedAdDataFirestore
        );

        updatedDuplicateScrapedAdDataFirestore.duplicateVideoIdentifiers.push(
            videoIdentifier
        );

        updatedDuplicateScrapedAdDataFirestore.processed = true;

        videoIdentifiersToUpdate.current[duplicateVideoIdentifier] =
            updatedDuplicateScrapedAdDataFirestore;

        setVideoData((prevData) => {
            return prevData.map((item) => {
                const { scrapedAdDataFirestore } = item;
                if (
                    scrapedAdDataFirestore.videoIdentifier === videoIdentifier
                ) {
                    return {
                        ...item,
                        uiState: {
                            ...item.uiState,
                            isDuplicateHandled: true,
                        },
                    };
                }
                return item;
            });
        });
    };

    const handleNotADuplicate = (videoIdentifier) => {
        const scrapedAdDataFirestore = structuredClone(
            videoData.find(
                (item) =>
                    item.scrapedAdDataFirestore.videoIdentifier ===
                    videoIdentifier
            ).scrapedAdDataFirestore
        );
        scrapedAdDataFirestore.potentialDuplicateVideoIdentifiers = [];
        scrapedAdDataFirestore.processed = true;

        videoIdentifiersToUpdate.current[videoIdentifier] =
            scrapedAdDataFirestore;

        setVideoData((prevData) =>
            prevData.map((item) => {
                if (
                    item.scrapedAdDataFirestore.videoIdentifier ===
                    videoIdentifier
                ) {
                    return {
                        ...item,
                        uiState: {
                            ...item.uiState,
                            isDuplicateHandled: true,
                        },
                    };
                }
                return item;
            })
        );
    };

    const handleUseAsAd = (videoIdentifier) => {
        // TODO: Mark video as "Use as Ad".
    };

    const handleDontUseAsAd = (videoIdentifier) => {
        // TODO: Mark video as "Don't Use as Ad".
    };

    const handleSave = async () => {
        // Execute deletions in parallel
        await Promise.all(
            videoIdentifiersToDelete.current.map(async (videoIdentifier) =>
                deleteScrapedAdFirestore(videoIdentifier)
            )
        );
        videoIdentifiersToDelete.current = [];

        // Execute updates in parallel
        await Promise.all(
            Object.keys(videoIdentifiersToUpdate.current).map(
                async (videoIdentifier) =>
                    saveScrapedAdFirestore(
                        videoIdentifiersToUpdate.current[videoIdentifier]
                    )
            )
        );
        videoIdentifiersToUpdate.current = {};

        // Refresh data by calling loadData directly
        await loadData();
    };

    // Group unprocessed videos by company using pageName
    const unprocessedVideosByPage = videoData
        .filter((item) => !item.scrapedAdDataFirestore.processed)
        .reduce((acc, item) => {
            const pageName = item.scrapedAdDataFirestore.pageName;
            if (!acc[pageName]) {
                acc[pageName] = [];
            }
            acc[pageName].push(item);
            return acc;
        }, {});

    // Sort each company's videos by startTimeUnixSeconds (earlier first).
    Object.keys(unprocessedVideosByPage).forEach((company) => {
        unprocessedVideosByPage[company].sort(
            (a, b) =>
                a.scrapedAdDataFirestore.startTimeUnixSeconds -
                b.scrapedAdDataFirestore.startTimeUnixSeconds
        );
    });

    // Group processed videos by company using pageName
    const processedVideosByPage = videoData
        .filter((item) => item.scrapedAdDataFirestore.processed)
        .reduce((acc, item) => {
            const pageName = item.scrapedAdDataFirestore.pageName;
            if (!acc[pageName]) {
                acc[pageName] = [];
            }
            acc[pageName].push(item);
            return acc;
        }, {});

    return (
        <div style={{ padding: '20px', minWidth: '1000px', margin: '0 auto' }}>
            <div style={{ marginBottom: '40px' }}>
                <h2>Unprocessed Videos </h2>
                {Object.keys(unprocessedVideosByPage).map((pageName) => (
                    <div key={pageName} style={{ marginBottom: '24px' }}>
                        <h3>{pageName}</h3>
                        <div
                            style={{
                                display: 'flex',
                                flexDirection: 'column',
                            }}
                        >
                            {unprocessedVideosByPage[pageName].map((item) => (
                                <UnprocessedVideoCard
                                    key={
                                        item.scrapedAdDataFirestore
                                            .videoIdentifier
                                    }
                                    videoDataItem={item}
                                    allVideoData={videoData}
                                    onConfirmDuplicate={handleConfirmDuplicate}
                                    onNotADuplicate={handleNotADuplicate}
                                    onUseAsAd={handleUseAsAd}
                                    onDontUseAsAd={handleDontUseAsAd}
                                    onSave={handleSave}
                                />
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            {/* Archive Section */}
            <div>
                <h2>Archive (Processed Videos)</h2>
                {Object.keys(processedVideosByPage).length === 0 ? (
                    <p>No processed videos.</p>
                ) : (
                    Object.keys(processedVideosByPage).map((pageName) => (
                        <div key={pageName} style={{ marginBottom: '24px' }}>
                            <h3>{pageName}</h3>
                            <div
                                style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(2, 1fr)',
                                    gap: '16px',
                                }}
                            >
                                {processedVideosByPage[pageName].map((item) => (
                                    <ArchiveVideoCard
                                        key={
                                            item.scrapedAdDataFirestore
                                                .videoIdentifier
                                        }
                                        video={item.scrapedAdDataFirestore}
                                    />
                                ))}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}

export default AdScraperDataView;
