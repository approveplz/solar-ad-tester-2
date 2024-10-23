import { saveFbAdSettings, getFbAdSettings } from './firebase.js';

function showButtonSpinner(button) {
    button.innerHTML = '<span class="spinner"></span> Saving...';
    button.classList.add('loading');
}

function hideButtonSpinner(button) {
    button.innerHTML = 'Save Changes';
    button.classList.remove('loading');
}

function populateForm(data) {
    if (!data || typeof data !== 'object') {
        console.warn('Invalid data provided to populateForm');
        return;
    }

    const setValue = (id, value) => {
        const element = document.getElementById(id);
        if (element && value !== undefined && value !== null) {
            element.value = value;
        }
    };

    // Promoted object params
    setValue('pixelId', data.promotedObjectParams?.pixelId);
    setValue('customEventType', data.promotedObjectParams?.customEventType);
    setValue('pageId', data.promotedObjectParams?.pageId);

    // Ad set params
    setValue('bidAmountCents', data.adSetParams?.bidAmountCents);
    setValue('optimizationGoal', data.adSetParams?.optimizationGoal);
    setValue('billingEvent', data.adSetParams?.billingEvent);
    setValue('dailyBudgetCents', data.adSetParams?.dailyBudgetCents);
    setValue('bidStrategy', data.adSetParams?.bidStrategy);
    // setValue('lifetimeBudgetCents', data.adSetParams?.lifetimeBudgetCents);
    setValue('targetingAgeMin', data.adSetParams?.adSetTargeting?.age_min);
    setValue('targetingAgeMax', data.adSetParams?.adSetTargeting?.age_max);

    // Ad creative params
    setValue('videoTitle', data.adCreativeParams?.videoTitle);
    setValue('videoMessage', data.adCreativeParams?.videoMessage);
    setValue('linkDescription', data.adCreativeParams?.linkDescription);
    setValue('urlTrackingTags', data.adCreativeParams?.urlTrackingTags);
    setValue('ctaType', data.adCreativeParams?.ctaType);
    setValue('ctaLinkValue', data.adCreativeParams?.ctaLinkValue);

    // Comment out or remove unused fields
    // setValue('states', data.adSetParams?.states?.join(','));
    // setValue('zipcodes', data.adSetParams?.zipcodes?.join(','));
    // setValue('instagramActorId', data.objectStorySpecParams?.instagramActorId);

    // Set form to non-editable state after populating
    setFormEditable(false);
}

async function handleSaveButtonClick(event) {
    event.preventDefault();
    console.log('Save button clicked');
    const saveButton = event.target;

    saveButton.disabled = true;
    showButtonSpinner(saveButton);

    try {
        const updatedFbAdSettings = getFormData();

        // Add campaign params (if needed)
        updatedFbAdSettings.campaignParams = {
            objective: 'OUTCOME_SALES',
            status: 'ACTIVE',
        };

        console.log(updatedFbAdSettings);
        const adType = 'O'; // Replace with the actual ad type you want to use
        await saveFbAdSettings(adType, updatedFbAdSettings);
        currentFormData = deepCopyFbAdSettings(updatedFbAdSettings);

        alert('Changes saved successfully!');

        // Return to edit button state
        formState = 'NOT_EDITABLE';
        editButton.style.display = 'block';
        cancelEditButton.style.display = 'none';
        saveButton.style.display = 'none';
        setFormEditable(false);
    } catch (error) {
        console.error('Error saving ad settings:', error);
        alert(`Error: ${error.message}.`);
    } finally {
        hideButtonSpinner(saveButton);
        saveButton.disabled = false;
    }
}

const form = document.getElementById('adSettingsForm');
const editButton = document.getElementById('editButton');
const cancelEditButton = document.getElementById('cancelEditButton');
const saveButton = document.getElementById('saveButton');

let formState = 'NOT_EDITABLE';
let currentFormData = {};

function setFormEditable(editable) {
    console.log('Setting form editable to:', editable);
    const inputs = form.querySelectorAll('input, select, textarea');
    inputs.forEach((input) => {
        input.disabled = !editable;
    });
}

function toggleEditMode() {
    console.log(`Edit button clicked, formState: ${formState}`);
    if (formState === 'NOT_EDITABLE') {
        formState = 'EDITABLE';
        editButton.style.display = 'none';
        cancelEditButton.style.display = 'block';
        saveButton.style.display = 'block';
        setFormEditable(true);
        currentFormData = deepCopyFbAdSettings(getFormData());
    } else {
        formState = 'NOT_EDITABLE';
        editButton.style.display = 'block';
        cancelEditButton.style.display = 'none';
        saveButton.style.display = 'none';
        setFormEditable(false);
    }
}

function cancelEdit() {
    formState = 'NOT_EDITABLE';
    editButton.style.display = 'block';
    cancelEditButton.style.display = 'none';
    saveButton.style.display = 'none';
    setFormEditable(false);
    populateForm(currentFormData);
}

editButton.addEventListener('click', toggleEditMode);
cancelEditButton.addEventListener('click', cancelEdit);
saveButton.addEventListener('click', handleSaveButtonClick);

// Store the original form data when the page loads
let originalFormData;
window.addEventListener('load', async () => {
    const adType = 'S'; // Replace with the actual ad type you want to use
    const fbAdSettings = await getFbAdSettingFirestore(adType);
    populateForm(fbAdSettings);
    originalFormData = deepCopyFbAdSettings(fbAdSettings);
});

function logButtonStatus() {
    const editButton = document.getElementById('editButton');
    const saveButton = document.getElementById('saveButton');
    console.log(
        'Edit button display:',
        editButton ? editButton.style.display : 'not found'
    );
    console.log(
        'Save button display:',
        saveButton ? saveButton.style.display : 'not found'
    );
    console.log('Form state:', formState);
}

async function main() {
    console.log('Main function started');
    const adType = 'O'; // Replace with the actual ad type you want to use
    try {
        const fbAdSettings = await getFbAdSettings(adType);
        console.log({ fbAdSettings, adType });
        if (fbAdSettings) {
            populateForm(fbAdSettings);
            currentFormData = deepCopyFbAdSettings(getFormData());
        } else {
            console.warn(
                'No FB Ad Settings found for the given ad type:',
                adType
            );
        }
    } catch (error) {
        console.error('Error fetching FB Ad Settings:', error);
        alert('Error loading ad settings. Please try again.');
    }

    try {
        console.log('Attempting to find buttons');
        const saveButton = document.getElementById('saveButton');
        const editButton = document.getElementById('editButton');

        if (!saveButton || !editButton) {
            throw new Error('One or both buttons not found in the DOM');
        }

        console.log('Buttons found, attaching event listeners');
        saveButton.addEventListener('click', handleSaveButtonClick);
        editButton.addEventListener('click', toggleEditMode);
        console.log('Event listeners attached');

        // Set initial state
        formState = 'NOT_EDITABLE';
        editButton.style.display = 'block';
        saveButton.style.display = 'none';
        setFormEditable(false);
        console.log('Initial state set');
    } catch (error) {
        console.error('Error setting up buttons:', error);
        alert(
            'Error: Could not set up buttons. Please check the console for more details.'
        );
    }
}

function initializeApp() {
    console.log('DOM content loaded, initializing app');
    main().then(() => {
        console.log('Main function completed');
        logButtonStatus();
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}

// Remove the previous event listener to avoid duplicate calls
document.removeEventListener('DOMContentLoaded', main);

function getFormData() {
    const formData = {
        promotedObjectParams: {},
        adSetParams: {
            adSetTargeting: {},
        },
        adCreativeParams: {},
        // objectStorySpecParams: {}, // Uncomment when needed
    };

    const getValue = (id) => {
        const element = document.getElementById(id);
        return element ? element.value.trim() : '';
    };

    // Promoted object params
    formData.promotedObjectParams = {
        pixelId: getValue('pixelId'),
        customEventType: getValue('customEventType'),
        pageId: getValue('pageId'),
    };

    // Ad set params
    formData.adSetParams = {
        bidAmountCents: getValue('bidAmountCents'),
        optimizationGoal: getValue('optimizationGoal'),
        billingEvent: getValue('billingEvent'),
        dailyBudgetCents: getValue('dailyBudgetCents'),
        // lifetimeBudgetCents: getValue('lifetimeBudgetCents'),
        bidStrategy: getValue('bidStrategy'),
        adSetTargeting: {
            age_min: getValue('targetingAgeMin'),
            age_max: getValue('targetingAgeMax'),
        },
    };

    // Ad creative params
    formData.adCreativeParams = {
        videoTitle: getValue('videoTitle'),
        videoMessage: getValue('videoMessage'),
        linkDescription: getValue('linkDescription'),
        urlTrackingTags: getValue('urlTrackingTags'),
        ctaType: getValue('ctaType'),
        ctaLinkValue: getValue('ctaLinkValue'),
    };

    // Uncomment when needed
    // formData.objectStorySpecParams = {
    //     instagramActorId: getValue('instagramActorId'),
    // };

    return formData;
}

// Add this helper function at the top of your file
function deepCopyFbAdSettings(fbAdSettings) {
    if (!fbAdSettings || typeof fbAdSettings !== 'object') {
        throw new Error(
            'Invalid fbAdSettings provided to deepCopyFbAdSettings'
        );
    }

    if (
        !fbAdSettings.adSetParams ||
        typeof fbAdSettings.adSetParams !== 'object'
    ) {
        throw new Error(
            'adSetParams not found or is not an object in fbAdSettings'
        );
    }

    if (
        !fbAdSettings.adSetParams.adSetTargeting ||
        typeof fbAdSettings.adSetParams.adSetTargeting !== 'object'
    ) {
        throw new Error(
            'adSetTargeting not found or is not an object in fbAdSettings.adSetParams'
        );
    }

    return {
        ...fbAdSettings,
        adSetParams: {
            ...fbAdSettings.adSetParams,
            adSetTargeting: { ...fbAdSettings.adSetParams.adSetTargeting },
        },
    };
}
