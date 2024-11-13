import { saveFbAdSettings, getFbAdSettings } from './firebase.js';

// State variables
let formState = 'NOT_EDITABLE';
let currentFormData = {};
let currentAdType;

// DOM elements
const form = document.getElementById('adSettingsForm');
const editButton = document.getElementById('editButton');
const cancelEditButton = document.getElementById('cancelEditButton');
const saveButton = document.getElementById('saveButton');

// Add this new function at the top of the file, after the imports
function handleError(error, customMessage = 'An error occurred') {
    console.error(customMessage, error);
    alert(`${customMessage}: ${error.message}`);
}

async function handleSaveButtonClick(event) {
    event.preventDefault();
    console.log('Save button clicked');
    const saveButton = event.target;

    try {
        const updatedFbAdSettings = getFormData();

        // Updated gender validation to explicitly check for empty array
        if (
            updatedFbAdSettings.adSetParams.adSetTargeting.genders.length === 0
        ) {
            throw new Error('Please select at least one gender option');
        }

        saveButton.disabled = true;
        showButtonSpinner(saveButton);

        // Add campaign params. These dont change
        updatedFbAdSettings.campaignParams = {
            objective: 'OUTCOME_SALES',
            status: 'ACTIVE',
        };

        console.log(updatedFbAdSettings);
        await saveFbAdSettings(currentAdType, updatedFbAdSettings);
        currentFormData = deepCopyFbAdSettings(updatedFbAdSettings);

        updateFormUI(false);
        alert('Changes saved successfully!');
    } catch (error) {
        handleError(error, 'Error saving ad settings');
    } finally {
        hideButtonSpinner(saveButton);
        saveButton.disabled = false;
    }
}

async function init() {
    console.log('Initializing page');
    try {
        const adTypeSelect = document.getElementById('adType');
        const saveButton = document.getElementById('saveButton');
        const editButton = document.getElementById('editButton');
        const cancelEditButton = document.getElementById('cancelEditButton');

        if (!adTypeSelect || !saveButton || !editButton || !cancelEditButton) {
            throw new Error(
                'One or more required elements not found in the DOM'
            );
        }

        // Add input change listeners
        const inputs = document.querySelectorAll('.adParam');
        inputs.forEach((input) => {
            input.addEventListener('change', handleInputChange);
        });

        adTypeSelect.addEventListener('change', handleAdTypeChange);
        saveButton.addEventListener('click', handleSaveButtonClick);
        editButton.addEventListener('click', toggleEditMode);
        cancelEditButton.addEventListener('click', cancelEdit);

        currentAdType = adTypeSelect.value;
        console.log('Initial currentAdType:', currentAdType);

        await loadAdSettings();
        console.log('Ad settings loaded successfully');

        console.log('Initial state set');
    } catch (error) {
        handleError(error, 'Error during page load setup');
    }
}

window.addEventListener('load', init);

async function loadAdSettings() {
    try {
        const fbAdSettings = await getFbAdSettings(currentAdType);
        console.log(
            `fbAdSettings loaded from storage: ${JSON.stringify(
                fbAdSettings,
                null,
                2
            )}`
        );
        populateForm(fbAdSettings);
        currentFormData = deepCopyFbAdSettings(fbAdSettings);
    } catch (error) {
        handleError(error, 'Error loading ad settings');
        resetFormParams(); // Reset form params on error
    }
}

async function handleAdTypeChange(event) {
    try {
        currentAdType = event.target.value;
        console.log({ currentAdType });
        await loadAdSettings();
    } catch (error) {
        handleError(error, 'Error changing ad type');
    }
}

/* 
Helper functions 
*/

function updateFormUI(isEditable) {
    console.log('Updating form UI, isEditable:', isEditable);
    setFormEditable(isEditable);

    editButton.style.display = isEditable ? 'none' : 'block';
    cancelEditButton.style.display = isEditable ? 'block' : 'none';
    saveButton.style.display = isEditable ? 'block' : 'none';

    formState = isEditable ? 'EDITABLE' : 'NOT_EDITABLE';
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

    // remove this default value
    const setCheckboxValues = (name, values) => {
        // if (!values) return;

        const checkboxes = document.querySelectorAll(
            `input[name="${name}"].adParam[type="checkbox"]`
        );
        checkboxes.forEach((checkbox) => {
            checkbox.checked = values.includes(checkbox.value);
        });
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
    setCheckboxValues(
        'adSetParams.adSetTargeting.genders',
        data.adSetParams?.adSetTargeting?.genders
    );

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

    updateFormUI(false);
}

function setFormEditable(editable) {
    console.log('Setting form editable to:', editable);
    const inputs = form.querySelectorAll('.adParam');
    inputs.forEach((input) => {
        input.disabled = !editable;
    });
}

function toggleEditMode() {
    console.log(`Edit button clicked, formState: ${formState}`);
    if (formState === 'NOT_EDITABLE') {
        updateFormUI(true);
        currentFormData = deepCopyFbAdSettings(getFormData());
    } else {
        updateFormUI(false);
    }
}

function cancelEdit() {
    updateFormUI(false);
    populateForm(currentFormData);
    console.log(
        'Cancelling edit, reverting to:',
        JSON.stringify(currentFormData, null, 2)
    );
}

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

    const getCheckboxValues = (name) => {
        const checkboxes = document.querySelectorAll(
            `input[name="${name}"][type="checkbox"]:checked`
        );
        return Array.from(checkboxes).map((cb) => cb.value);
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
            genders: getCheckboxValues('adSetParams.adSetTargeting.genders'),
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

function showButtonSpinner(button) {
    button.innerHTML = '<span class="spinner"></span> Saving...';
    button.classList.add('loading');
}

function hideButtonSpinner(button) {
    button.innerHTML = 'Save Changes';
    button.classList.remove('loading');
}

function resetFormParams() {
    const inputs = document.querySelectorAll('.adParam');
    inputs.forEach((input) => {
        if (input.type === 'checkbox') {
            input.checked = false;
        } else {
            input.value = '';
        }
    });
}

function handleInputChange() {
    const currentData = getFormData();
    console.log('Form data updated:', JSON.stringify(currentData, null, 2));
}
