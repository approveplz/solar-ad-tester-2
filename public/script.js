import { saveFbAdSettings, getFbAdSettings } from './firebase.js';

// const adParams = {
//     adAccountId: '23423423423',
//     campaignParams: {
//         objective: 'OUTCOME_LEADS',
//         special_ad_categories: [],
//         status: 'PAUSED',
//     },
//     adSetParams: {
//         bidAmountCents: '200',
//         states: ['CA', 'NV'],
//         dailyBudgetCents: '2000',
//         bidStrategy: 'COST_CAP',
//         optimizationGoal: 'IMPRESSIONS',
//         billingEvent: 'IMPRESSIONS',
//         zipcodes: ['94116'],
//     },
//     promotedObjectParams: {
//         pixelId: '700671091822152',
//         customEventType: 'LEAD',
//     },
//     objectStorySpecParams: {
//         pageId: '399061289952685',
//         instagramActorId: '6728233840571130',
//         videoTitle: 'test ad title',
//         message: 'test add message',
//         linkDescription: 'test link description',
//         callToAction: {
//             type: 'LEARN_MORE',
//             value: 'https://www.greenenergycollective.org/survey/no-cost-solar',
//         },
//     },
// };


function showButtonSpinner(button) {
    button.innerHTML = '<span class="spinner"></span> Saving...';
    button.classList.add('loading');
}

function hideButtonSpinner(button) {
    button.innerHTML = 'Save Changes';
    button.classList.remove('loading');
}


function populateForm(data) {
    document.getElementById('objective').value = data.campaignParams.objective;
    document.getElementById('status').value = data.campaignParams.status;
    document.getElementById('bidAmountCents').value =
        data.adSetParams.bidAmountCents;
    document.getElementById('states').value = data.adSetParams.states.join(',');
    document.getElementById('dailyBudgetCents').value =
        data.adSetParams.dailyBudgetCents;
    document.getElementById('bidStrategy').value = data.adSetParams.bidStrategy;
    document.getElementById('optimizationGoal').value =
        data.adSetParams.optimizationGoal;
    document.getElementById('billingEvent').value =
        data.adSetParams.billingEvent;
    document.getElementById('zipcodes').value =
        data.adSetParams.zipcodes.join(',');
    document.getElementById('pixelId').value =
        data.promotedObjectParams.pixelId;
    document.getElementById('customEventType').value =
        data.promotedObjectParams.customEventType;
    document.getElementById('pageId').value = data.objectStorySpecParams.pageId;
    document.getElementById('instagramActorId').value =
        data.objectStorySpecParams.instagramActorId;
    document.getElementById('videoTitle').value =
        data.objectStorySpecParams.videoTitle;
    document.getElementById('message').value =
        data.objectStorySpecParams.message;
    document.getElementById('linkDescription').value =
        data.objectStorySpecParams.linkDescription;
    document.getElementById('callToActionType').value =
        data.objectStorySpecParams.callToAction.type;
    document.getElementById('callToActionValue').value =
        data.objectStorySpecParams.callToAction.value;
}

async function main() {
    const uuid = 'BSJ3asWtTtBXJNKYtCmy';
    const fbAdSettings = await getFbAdSettings(uuid);
    populateForm(fbAdSettings);

    document
        .getElementById('submitButton')
        .addEventListener('click', async function () {
            const fbAdSettings = {
                campaignParams: {
                    objective: document.getElementById('objective').value,
                    status: document.getElementById('status').value,
                },
                adSetParams: {
                    bidAmountCents:
                        document.getElementById('bidAmountCents').value,
                    states: document.getElementById('states').value.split(','),
                    dailyBudgetCents:
                        document.getElementById('dailyBudgetCents').value,
                    bidStrategy: document.getElementById('bidStrategy').value,
                    optimizationGoal:
                        document.getElementById('optimizationGoal').value,
                    billingEvent: document.getElementById('billingEvent').value,
                    zipcodes: document
                        .getElementById('zipcodes')
                        .value.split(','),
                },
                promotedObjectParams: {
                    pixelId: document.getElementById('pixelId').value,
                    customEventType:
                        document.getElementById('customEventType').value,
                },
                objectStorySpecParams: {
                    pageId: document.getElementById('pageId').value,
                    instagramActorId:
                        document.getElementById('instagramActorId').value,
                    videoTitle: document.getElementById('videoTitle').value,
                    message: document.getElementById('message').value,
                    linkDescription:
                        document.getElementById('linkDescription').value,
                    callToAction: {
                        type: document.getElementById('callToActionType').value,
                        value: document.getElementById('callToActionValue')
                            .value,
                    },
                },
            };
            console.log(fbAdSettings);
            await saveFbAdSettings(uuid, fbAdSettings);

            // fetch('YOUR_SERVER_URL', {
            //     method: 'POST',
            //     headers: {
            //         'Content-Type': 'application/json',
            //     },
            //     body: JSON.stringify(adCampaign),
            // })
            //     .then((response) => response.json())
            //     .then((data) => console.log('Success:', data))
            //     .catch((error) => console.error('Error:', error));
        });
}

main();
