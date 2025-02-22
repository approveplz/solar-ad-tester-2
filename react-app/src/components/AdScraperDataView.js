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
                    <p>
                        <strong>Ad Running For:</strong> <br />
                        {Math.floor(
                            (Date.now() -
                                scrapedAdDataFirestore.startTimeUnixSeconds *
                                    1000) /
                                (1000 * 60 * 60 * 24)
                        )}{' '}
                        days
                    </p>

                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            marginBottom: '8px',
                        }}
                    >
                        {uiState.duplicateStatus.processed ? (
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
                        {uiState.isAdUsageHandled ? (
                            <span
                                style={{
                                    backgroundColor: '#28a745',
                                    color: '#fff',
                                    padding: '8px 12px',
                                    borderRadius: '4px',
                                }}
                            >
                                Ad Usage Status Updated{' '}
                                <span style={{ marginLeft: '4px' }}>✓</span>
                            </span>
                        ) : (
                            <button
                                disabled={!uiState.duplicateStatus.processed}
                                onClick={() =>
                                    onUseAsAd(
                                        videoDataItem.scrapedAdDataFirestore
                                            .videoIdentifier,
                                        uiState.duplicateStatus.originalVideoId
                                    )
                                }
                                style={{
                                    ...buttonStyle,
                                    backgroundColor: !uiState.duplicateStatus
                                        .processed
                                        ? '#ccc'
                                        : 'green',
                                    color: !uiState.duplicateStatus.processed
                                        ? '#666'
                                        : '#fff',
                                    cursor: !uiState.duplicateStatus.processed
                                        ? 'not-allowed'
                                        : 'pointer',
                                }}
                            >
                                Use as Ad
                            </button>
                        )}
                    </div>
                    <div style={{ marginTop: '12px' }}>
                        <button
                            disabled={!uiState.duplicateStatus.processed}
                            onClick={onSave}
                            style={{
                                ...buttonStyle,
                                backgroundColor: !uiState.duplicateStatus
                                    .processed
                                    ? '#ccc'
                                    : '#007BFF',
                                color: !uiState.duplicateStatus.processed
                                    ? '#666'
                                    : '#fff',
                                cursor: !uiState.duplicateStatus.processed
                                    ? 'not-allowed'
                                    : 'pointer',
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
                                    <span
                                        style={{
                                            color: neighbor.processed
                                                ? 'green'
                                                : 'inherit',
                                        }}
                                    >
                                        {neighbor.processed ? 'Yes' : 'No'}
                                    </span>
                                </p>
                                <p>
                                    <strong>Similarity Score:</strong>
                                    <br />
                                    {neighbor.similarityScore}
                                </p>
                                <p>
                                    <strong>Used for FB ad:</strong> <br />
                                    {neighbor.isUsedForAd ? 'Yes' : 'No'}
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
                <span style={{ color: video.isUsedForAd ? 'red' : 'inherit' }}>
                    {video.isUsedForAd ? 'Yes' : 'No'}
                </span>
            </p>
            <p>
                <strong>Company:</strong> {video.pageName}
            </p>
        </div>
    );
}

function AdScraperDataView() {
    const [videoData, setVideoData] = useState([]);
    const [loading, setLoading] = useState(false);

    // For unprocessed pages: when a page is in this set, it is collapsed.
    const [unprocessedCollapsedPages, setUnprocessedCollapsedPages] = useState(
        new Set()
    );
    // For processed (archived) pages: when a page is in this set, it is collapsed.
    const [collapsedArchivePages, setCollapsedArchivePages] = useState(
        new Set()
    );

    const videoIdentifiersToDelete = useRef([]);
    const videoIdentifiersToUpdate = useRef({});
    const videoIdentifiersToUseAsAd = useRef([]);

    const getNearestNeighbors = (firestoreData, scrapedAdsFirestore, topK) => {
        const currentEmbedding = firestoreData.descriptionEmbedding;

        // Filter out the current video from the scraped ads list.
        const filteredAds = scrapedAdsFirestore.filter(
            (scrapedAd) =>
                scrapedAd.videoIdentifier !== firestoreData.videoIdentifier
        );

        const neighbors = filteredAds.map((scrapedAd) => {
            const similarityScore = getCosineSimilarity(
                currentEmbedding,
                scrapedAd.descriptionEmbedding
            );
            return {
                similarityScore,
                videoIdentifier: scrapedAd.videoIdentifier,
                processed: scrapedAd.processed,
                isUsedForAd: scrapedAd.isUsedForAd,
            };
        });

        neighbors.sort((a, b) => {
            const scoreDiff = b.similarityScore - a.similarityScore;
            if (Math.abs(scoreDiff) < 0.01) {
                if (a.processed === b.processed) {
                    return scoreDiff;
                }
                return a.processed ? -1 : 1;
            }
            return scoreDiff;
        });

        return neighbors.slice(0, topK);
    };

    // Update loadData to show loading indicators during the data fetch
    const loadData = useCallback(async () => {
        setLoading(true);
        try {
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
                        isUsedForAd: neighbor.isUsedForAd,
                    })
                );
                return {
                    scrapedAdDataFirestore: firestoreData,
                    uiState: {
                        duplicateStatus: {
                            processed: false,
                            originalVideoId: null,
                            type: null,
                        },
                        nearestNeighbors: nearestNeighborsVideoIdentifiers,
                        isAdUsageHandled: false,
                    },
                };
            });
            setVideoData(combinedData);
        } catch (error) {
            console.error('Error loading data:', error);
        } finally {
            setLoading(false);
        }
    }, []);

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
                if (
                    item.scrapedAdDataFirestore.videoIdentifier ===
                    videoIdentifier
                ) {
                    return {
                        ...item,
                        uiState: {
                            ...item.uiState,
                            duplicateStatus: {
                                processed: true,
                                originalVideoId: duplicateVideoIdentifier,
                                type: 'duplicate',
                            },
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
                            duplicateStatus: {
                                processed: true,
                                originalVideoId: videoIdentifier,
                                type: 'original',
                            },
                        },
                    };
                }
                return item;
            })
        );
    };

    const handleUseAsAd = async (videoIdentifier, videoIdentifierToUseAsAd) => {
        videoIdentifiersToUseAsAd.current.push(videoIdentifierToUseAsAd);
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
                            isAdUsageHandled: true,
                        },
                    };
                }
                return item;
            })
        );
    };

    const uploadVideoToGdriveIngestionFolder = async (videoIdentifier) => {
        try {
            const uploadVideoToGdriveIngestionFolderUrl =
                'https://script.google.com/macros/s/AKfycbyLUySjI86tMvM1ZhQdAtkhR0rnu_jYNIByekhyGlM7DBBDnSBb3zmqQh17xRThSXEfyA/exec';
            const videoDataItem = videoData.find(
                (item) =>
                    item.scrapedAdDataFirestore.videoIdentifier ===
                    videoIdentifier
            );
            const videoUrl = videoDataItem.scrapedAdDataFirestore.url;

            const fetchUrl = new URL(uploadVideoToGdriveIngestionFolderUrl);
            fetchUrl.searchParams.append('fileUrl', videoUrl);
            fetchUrl.searchParams.append('videoIdentifier', videoIdentifier);

            const response = await fetch(fetchUrl);
            if (!response.ok) {
                throw new Error('Failed to upload video to Google Drive');
            }
            return videoIdentifier;
        } catch (error) {
            console.error('Error uploading video to Google Drive:', error);
            return null;
        }
    };

    const handleSave = async () => {
        setLoading(true);
        try {
            // Delete videos from firestore
            await Promise.all(
                videoIdentifiersToDelete.current.map(async (videoIdentifier) =>
                    deleteScrapedAdFirestore(videoIdentifier)
                )
            );
            videoIdentifiersToDelete.current = [];

            // Update firestore with assigned duplicates
            await Promise.all(
                Object.keys(videoIdentifiersToUpdate.current).map(
                    async (videoIdentifier) =>
                        saveScrapedAdFirestore(
                            videoIdentifiersToUpdate.current[videoIdentifier]
                        )
                )
            );
            videoIdentifiersToUpdate.current = {};

            // Upload videos to Google Drive Ingestion Folder to create ads
            const successfullyUploadedVideoIdentifiers = await Promise.all(
                videoIdentifiersToUseAsAd.current.map(async (videoIdentifier) =>
                    uploadVideoToGdriveIngestionFolder(videoIdentifier)
                )
            );

            console.log({ successfullyUploadedVideoIdentifiers });

            await Promise.all(
                successfullyUploadedVideoIdentifiers.map(
                    async (videoIdentifier) => {
                        const scrapedAdDataFirestoreOfVideoToUseAsAd =
                            structuredClone(
                                videoData.find(
                                    (item) =>
                                        item.scrapedAdDataFirestore
                                            .videoIdentifier === videoIdentifier
                                ).scrapedAdDataFirestore
                            );
                        scrapedAdDataFirestoreOfVideoToUseAsAd.isUsedForAd = true;
                        scrapedAdDataFirestoreOfVideoToUseAsAd.processed = true;
                        return saveScrapedAdFirestore(
                            scrapedAdDataFirestoreOfVideoToUseAsAd
                        );
                    }
                )
            );

            videoIdentifiersToUseAsAd.current = [];

            // Refresh data after saving
            await loadData();
        } catch (error) {
            console.error('Error during save:', error);
        } finally {
            setLoading(false);
        }
    };

    // Toggle collapse/expand for unprocessed pages.
    const toggleUnprocessedPage = (pageName) => {
        setUnprocessedCollapsedPages((prev) => {
            const newSet = new Set(prev);
            if (newSet.has(pageName)) {
                newSet.delete(pageName); // Expand page
            } else {
                newSet.add(pageName); // Collapse page
            }
            return newSet;
        });
    };

    // Toggle collapse/expand for archived (processed) pages.
    const toggleArchivePage = (pageName) => {
        setCollapsedArchivePages((prev) => {
            const newSet = new Set(prev);
            if (newSet.has(pageName)) {
                newSet.delete(pageName); // Expand page
            } else {
                newSet.add(pageName); // Collapse page
            }
            return newSet;
        });
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
        <div>
            {loading && (
                <div
                    style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        backgroundColor: 'rgba(0, 0, 0, 0.5)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 10000,
                    }}
                >
                    <div
                        style={{
                            backgroundColor: '#fff',
                            padding: '20px 40px',
                            borderRadius: '8px',
                            boxShadow: '0 4px 10px rgba(0,0,0,0.2)',
                            fontSize: '24px',
                            fontWeight: 'bold',
                        }}
                    >
                        Loading...
                    </div>
                </div>
            )}
            <div
                style={{
                    padding: '20px',
                    minWidth: '1000px',
                    margin: '0 auto',
                }}
            >
                <div style={{ marginBottom: '40px' }}>
                    <h2>Unprocessed Videos</h2>
                    {Object.keys(unprocessedVideosByPage).map((pageName) => {
                        const isUnprocessedExpanded =
                            !unprocessedCollapsedPages.has(pageName);
                        return (
                            <div
                                key={pageName}
                                style={{ marginBottom: '24px' }}
                            >
                                <h3
                                    style={{ cursor: 'pointer' }}
                                    onClick={() =>
                                        toggleUnprocessedPage(pageName)
                                    }
                                >
                                    {pageName}{' '}
                                    {isUnprocessedExpanded ? '[-]' : '[+]'}
                                </h3>
                                {isUnprocessedExpanded && (
                                    <div
                                        style={{
                                            display: 'flex',
                                            flexDirection: 'column',
                                        }}
                                    >
                                        {unprocessedVideosByPage[pageName].map(
                                            (item) => (
                                                <UnprocessedVideoCard
                                                    key={
                                                        item
                                                            .scrapedAdDataFirestore
                                                            .videoIdentifier
                                                    }
                                                    videoDataItem={item}
                                                    allVideoData={videoData}
                                                    onConfirmDuplicate={
                                                        handleConfirmDuplicate
                                                    }
                                                    onNotADuplicate={
                                                        handleNotADuplicate
                                                    }
                                                    onUseAsAd={handleUseAsAd}
                                                    onSave={handleSave}
                                                />
                                            )
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* Archive Section */}
                <div>
                    <h2>Archive (Processed Videos)</h2>
                    {Object.keys(processedVideosByPage).map((pageName) => {
                        const isArchiveExpanded =
                            !collapsedArchivePages.has(pageName);
                        return (
                            <div
                                key={pageName}
                                style={{ marginBottom: '24px' }}
                            >
                                <h3
                                    style={{ cursor: 'pointer' }}
                                    onClick={() => toggleArchivePage(pageName)}
                                >
                                    {pageName}{' '}
                                    {isArchiveExpanded ? '[-]' : '[+]'}
                                </h3>
                                {isArchiveExpanded && (
                                    <div
                                        style={{
                                            display: 'grid',
                                            gridTemplateColumns:
                                                'repeat(2, 1fr)',
                                            gap: '16px',
                                        }}
                                    >
                                        {processedVideosByPage[pageName].map(
                                            (item) => (
                                                <ArchiveVideoCard
                                                    key={
                                                        item
                                                            .scrapedAdDataFirestore
                                                            .videoIdentifier
                                                    }
                                                    video={
                                                        item.scrapedAdDataFirestore
                                                    }
                                                />
                                            )
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

export default AdScraperDataView;
