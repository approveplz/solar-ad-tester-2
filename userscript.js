// ==UserScript==
// @name         Fb Library Ad Downloader
// @version      Alpha-v1
// @description  Download Facebook Library Ads with a single click. Checks for duplicates
// @author       afz
// @match        https://www.facebook.com/ads/library/*
// @run-at       document-start
// @grant        GM_xmlhttpRequest
// @connect      127.0.0.1
// ==/UserScript==

// Will need to add domain of prod cloud function

(function () {
    'use strict';

    const CLOUD_FUNCTION_URL =
        'http://127.0.0.1:5001/solar-ad-tester/us-central1/handleCreateAdFromUIClick';

    const DUPLICATE = 'DUPLICATE';

    const adsFromSearchApi = {};

    enhanceXMLHttpRequest();

    // Setup the observer to detect video elements
    window.addEventListener('load', setupObserver);

    /**
     * Enhances the XMLHttpRequest to monitor specific POST requests
     */
    function enhanceXMLHttpRequest() {
        const originalXMLOpen = XMLHttpRequest.prototype.open;

        XMLHttpRequest.prototype.open = function (method, url) {
            if (
                method.toUpperCase() === 'POST' &&
                url.includes('/ads/library/async/search_ads/')
            ) {
                this.addEventListener(
                    'load',
                    // this is the XMLHttpRequest object
                    handleXMLRequestToSearchAds.bind(this)
                );
                this.addEventListener('error', function () {
                    console.log('POST to specific URL failed:', url);
                });
            }
            originalXMLOpen.apply(this, arguments);
        };
    }

    function handleXMLRequestToSearchAds() {
        handleSearchAdsResponse(this.responseText);
    }

    function handleSearchAdsResponse(responseText) {
        try {
            // Remove the initial "for (;;);" statement if present
            const cleanResponse = responseText.replace(
                /^for\s*\(\s*;\s*;\s*\)\s*;/,
                ''
            );

            const jsonData = JSON.parse(cleanResponse);

            const payload = jsonData.payload;

            const { results } = payload;

            const ads = results.flat();

            const parsedAds = ads.map((ad) => parseAd(ad));

            parsedAds.forEach((ad) => {
                if (!adsFromSearchApi[ad.adArchiveId]) {
                    adsFromSearchApi[ad.adArchiveId] = ad;
                }
            });
        } catch (error) {
            console.error('Error parsing search response:', error);
            console.log({ responseText });
            throw error;
        }
    }

    function parseAd(ad) {
        const {
            adArchiveID, // This is Library ID
            publisherPlatform,
            snapshot,
            startDate,
            endDate,
            hasUserReported,
        } = ad;

        const {
            ad_creative_id,
            page_name,
            page_id,
            page_like_count,
            videos,
            cards,
            cta_type,
            title,
            body,
        } = snapshot;

        let videoHdUrl, videoSdUrl, adBody, adTitle, videoPreviewImageUrl;

        // If cards exist, use it. It has better data
        // Fields, like video, may also be empty if cards exist
        if (cards?.length) {
            adBody = cards[0].body;
            adTitle = cards[0].title;
            videoHdUrl = cards[0].video_hd_url;
            videoSdUrl = cards[0].video_sd_url;
            videoPreviewImageUrl = cards[0].video_preview_image_url;
        } else {
            adBody = body.markup.__html;
            adTitle = title;
            videoHdUrl = videos[0].video_hd_url;
            videoSdUrl = videos[0].video_sd_url;
            videoPreviewImageUrl = videos[0].video_preview_image_url;
        }

        return {
            adArchiveId: adArchiveID,
            publisherPlatform,
            startDateUnixSeconds: startDate,
            endDateUnixSeconds: endDate,
            adCreativeId: ad_creative_id,
            pageName: page_name,
            pageId: page_id,
            pageLikeCount: page_like_count,
            videoHdUrl,
            videoSdUrl,
            videoPreviewImageUrl,
            hasUserReported,
            adTitle,
            adBody,
            ctaType: cta_type,
        };
    }

    /**
     * Sets up a MutationObserver to detect the addition of video elements
     */
    function setupObserver() {
        const observer = new MutationObserver((mutations, obs) => {
            // Loop through each mutation detected
            mutations.forEach((mutation) => {
                const { type, addedNodes } = mutation;
                // type === 'childList' means there were changes to the child nodes of the observed element
                // We check for added nodes
                if (type === 'childList' && addedNodes.length > 0) {
                    mutation.addedNodes.forEach((node) => {
                        const { nodeType, tagName } = node;
                        // Nested elements added at once only trigger one mutation event
                        if (
                            nodeType === 1 && // Check if it's an element node
                            (tagName === 'VIDEO' || node.querySelector('video')) // Check if it's a video element or contains a video element
                        ) {
                            injectUI();
                        }
                    });
                }
            });
        });

        observer.observe(document.body, {
            // Watch for changes to the child nodes of the body element
            childList: true,
            // Watch entire subtree, including child elements
            subtree: true,
        });
    }

    /**
     * Injects a download link UI for each video element
     */
    function injectUI() {
        const videoElements = document.querySelectorAll('video');
        videoElements.forEach((video, index) => {
            if (
                video.nextElementSibling &&
                video.nextElementSibling.classList.contains(
                    'video-link-container'
                )
            ) {
                return; // Skip if the link is already injected
            }

            const videoSrc = getVideoSource(video);
            if (videoSrc) {
                const link = createDownloadLink(videoSrc, index);
                const linkContainer = createLinkContainer();

                positionVideoElement(video);
                video.parentNode.insertBefore(linkContainer, video.nextSibling);
                linkContainer.appendChild(link);

                link.addEventListener('click', () => handleLinkClick(video));
            }
        });
    }

    /**
     * Retrieves the source URL of a video element
     * @param {HTMLVideoElement} video - The video element
     * @returns {string} The source URL of the video
     */
    function getVideoSource(video) {
        return (
            video.src ||
            (video.querySelector('source')
                ? video.querySelector('source').src
                : '')
        );
    }

    /**
     * Creates a download link element
     * @param {string} videoSrc - The source URL of the video
     * @param {number} index - The index of the video element
     * @returns {HTMLAnchorElement} The created download link element
     */
    function createDownloadLink(videoSrc, index) {
        const link = document.createElement('a');
        link.href = videoSrc;
        link.textContent = `Open Video ${index + 1}`;
        link.target = '_blank';
        link.style.cssText = `
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            position: absolute !important;
            bottom: 20px !important;
            left: 50% !important;
            transform: translateX(-50%) !important;
            min-width: 120px !important;
            background-color: #4CAF50 !important;
            color: white !important;
            text-decoration: none !important;
            border-radius: 5px !important;
            font-size: 16px !important;
            z-index: 10000 !important;
            cursor: pointer !important;
            opacity: 0.9 !important;
            min-height: 40px !important;
        `;
        link.style.pointerEvents = 'auto !important';
        return link;
    }

    /**
     * Creates a container for the download link
     * @returns {HTMLDivElement} The created container element
     */
    function createLinkContainer() {
        const linkContainer = document.createElement('div');
        linkContainer.classList.add('video-link-container');
        linkContainer.style.cssText = `
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            width: 100% !important;
            height: 100% !important;
            display: flex !important;
            align-items: flex-end !important;
            justify-content: center !important;
        `;
        return linkContainer;
    }

    /**
     * Ensures the video element has a position style that allows absolute positioning of descendants
     * @param {HTMLVideoElement} video - The video element
     */
    function positionVideoElement(video) {
        if (
            video.style.position !== 'relative' &&
            video.style.position !== 'absolute'
        ) {
            video.style.position = 'relative !important';
        }
    }

    function findLibraryIdOfVideo(video) {
        let parent = video.parentNode;
        while (parent) {
            const libraryIdElement = Array.from(
                parent.getElementsByTagName('div')
            ).find((div) => div.textContent.includes('Library ID:'));
            if (libraryIdElement) {
                const libraryIdText = libraryIdElement.textContent;
                const match = libraryIdText.match(/Library ID: (\d+)/);
                if (match) {
                    return match[1];
                }
            }
            parent = parent.parentNode;
        }
        return null;
    }

    async function handleLinkClick(video) {
        const libraryId = findLibraryIdOfVideo(video);

        if (!libraryId) {
            throw new Error(
                `Unable to find Library ID of video. src=${video.src}`
            );
        }

        const adInfo = adsFromSearchApi[libraryId];
        console.log({ adInfo });
        if (!adInfo) {
            throw new Error(`Ad info not found for Library ID: ${libraryId}`);
        }

        try {
            GM_xmlhttpRequest({
                method: 'POST',
                url: CLOUD_FUNCTION_URL,
                headers: {
                    'Content-Type': 'application/json',
                },
                data: JSON.stringify(adInfo),
                onload: function (response) {
                    const { code } = JSON.parse(response.responseText);
                    console.log('Cloud Function Response:', code);

                    if (code === DUPLICATE) {
                        alert('This ad has already been downloaded');
                    } else {
                        alert('Ad downloaded successfully');
                    }
                },
                onerror: function (error) {
                    console.error('Error calling Cloud Function:', error);
                },
            });
        } catch (error) {
            console.error('Error initiating GM_xmlhttpRequest:', error);
        }
    }
})();
