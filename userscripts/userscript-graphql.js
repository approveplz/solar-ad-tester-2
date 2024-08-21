// ==UserScript==
// @name         Fb Library Ad Downloader
// @version      Alpha-v3
// @description  Download Facebook Library Ads with a single click. Checks for duplicates
// @author       afz
// @match        https://www.facebook.com/ads/library/*
// @run-at       document-start
// @grant        GM_xmlhttpRequest
// @connect      127.0.0.1
// @connect      createadfromclickrequest-txyabkufvq-uc.a.run.app
// ==/UserScript==

(function () {
    'use strict';

    const CLOUD_FUNCTION_URL =
        'http://127.0.0.1:5001/solar-ad-tester-2/us-central1/createAdFromClickRequest';

    // const CLOUD_FUNCTION_URL =
    //     'https://createadfromclickrequest-txyabkufvq-uc.a.run.app';

    const DUPLICATE = 'DUPLICATE';

    const adsFromSearchApi = {};

    enhanceXHR();
    console.log('XHR successfully enhanced');

    window.addEventListener('load', setupObserver);

    function enhanceXHR() {
        const originalOpen = XMLHttpRequest.prototype.open;
        const originalSend = XMLHttpRequest.prototype.send;

        XMLHttpRequest.prototype.open = function (method, url, ...args) {
            if (url.includes('/api/graphql/')) {
                this._isGraphQL = true;
                console.log('GraphQL request detected:', url);
            }
            return originalOpen.apply(this, [method, url, ...args]);
        };

        XMLHttpRequest.prototype.send = function (body) {
            if (this._isGraphQL) {
                console.log('GraphQL request body:', body);
                this.addEventListener('load', function () {
                    console.log('GraphQL response received');
                    analyzeGraphQLResponse(this.responseText, body);
                });
            }
            return originalSend.apply(this, arguments);
        };
    }

    function parseUrlEncodedBody(body) {
        const params = new URLSearchParams(body);
        const result = {};
        for (const [key, value] of params) {
            result[key] = value;
        }
        return result;
    }

    function analyzeGraphQLResponse(responseText, requestBody) {
        try {
            const jsonObjects = responseText
                .split('\n')
                .filter((line) => line.trim() !== '');
            jsonObjects.forEach((jsonString) => {
                try {
                    const jsonData = JSON.parse(jsonString);
                    if (containsAdData(jsonData)) {
                        console.log('Ad data found in response');
                        const ads = extractAdsFromGraphQLResponse(jsonData);
                        updateAdsFromSearchApi(ads);
                    }
                } catch (error) {
                    console.error(
                        'Error parsing individual JSON object:',
                        error
                    );
                }
            });
        } catch (error) {
            console.error('Error analyzing GraphQL response:', error);
        }
    }

    function containsAdData(jsonData) {
        return (
            jsonData.data &&
            jsonData.data.ad_library_main &&
            jsonData.data.ad_library_main.search_results_connection &&
            jsonData.data.ad_library_main.search_results_connection.edges
        );
    }

    function extractAdsFromGraphQLResponse(jsonData) {
        if (!containsAdData(jsonData)) return [];

        const edges =
            jsonData.data.ad_library_main.search_results_connection.edges;
        return edges.flatMap((edge) => edge.node.collated_results.map(parseAd));
    }

    function parseAd(ad) {
        const {
            ad_archive_id,
            publisher_platform,
            snapshot,
            start_date,
            end_date,
            has_user_reported,
        } = ad;

        const {
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

        if (cards?.length) {
            adBody = cards[0].body;
            adTitle = cards[0].title;
            videoHdUrl = cards[0].video_hd_url;
            videoSdUrl = cards[0].video_sd_url;
            videoPreviewImageUrl = cards[0].video_preview_image_url;
        } else {
            adBody = body.text;
            adTitle = title;
            if (videos && videos.length > 0) {
                videoHdUrl = videos[0].video_hd_url;
                videoSdUrl = videos[0].video_sd_url;
                videoPreviewImageUrl = videos[0].video_preview_image_url;
            }
        }

        return {
            adArchiveId: ad_archive_id,
            publisherPlatform: publisher_platform,
            startDateUnixSeconds: start_date,
            endDateUnixSeconds: end_date,
            pageName: page_name,
            pageId: page_id,
            pageLikeCount: page_like_count,
            videoHdUrl,
            videoSdUrl,
            videoPreviewImageUrl,
            hasUserReported: has_user_reported,
            adTitle,
            adBody,
            ctaType: cta_type,
        };
    }

    function updateAdsFromSearchApi(ads) {
        ads.forEach((ad) => {
            if (!adsFromSearchApi[ad.adArchiveId]) {
                adsFromSearchApi[ad.adArchiveId] = ad;
                console.log('New ad added:', ad);
            }
        });
    }

    function setupObserver() {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList') {
                    mutation.addedNodes.forEach((node) => {
                        if (
                            node.nodeType === 1 &&
                            (node.tagName === 'VIDEO' ||
                                node.querySelector('video'))
                        ) {
                            injectUI();
                        }
                    });
                }
            });
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true,
        });
    }

    function injectUI() {
        const videoElements = document.querySelectorAll('video');
        videoElements.forEach((video, index) => {
            if (
                video.nextElementSibling &&
                video.nextElementSibling.classList.contains(
                    'video-link-container'
                )
            ) {
                return;
            }

            const videoSrc = getVideoSource(video);
            if (videoSrc) {
                const link = createDownloadLink(videoSrc, index);
                const linkContainer = createLinkContainer();

                positionVideoElement(video);
                video.parentNode.insertBefore(linkContainer, video.nextSibling);
                linkContainer.appendChild(link);

                link.addEventListener('click', (e) => {
                    e.preventDefault();
                    handleLinkClick(video);
                });
            }
        });
    }

    function getVideoSource(video) {
        return (
            video.src ||
            (video.querySelector('source')
                ? video.querySelector('source').src
                : '')
        );
    }

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

    function handleLinkClick(video) {
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
