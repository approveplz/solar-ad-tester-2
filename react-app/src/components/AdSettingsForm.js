import React, { useState, useEffect } from 'react';
import { saveFbAdSettings, getFbAdSettings } from '../firebase.js';
import { commonSelectArrowStyles } from '../styles/selectStyles';

function handleError(error, customMessage = 'An error occurred') {
    console.error(customMessage, error);
    alert(`${customMessage}: ${error.message}`);
}

function deepCopyFbAdSettings(fbAdSettings) {
    if (!fbAdSettings || typeof fbAdSettings !== 'object') {
        throw new Error(
            'Invalid fbAdSettings provided to deepCopyFbAdSettings'
        );
    }
    if (!fbAdSettings.adSetParams?.adSetTargeting) {
        throw new Error('adSetParams.adSetTargeting not found in fbAdSettings');
    }
    if (typeof structuredClone === 'function') {
        return structuredClone(fbAdSettings);
    } else {
        return JSON.parse(JSON.stringify(fbAdSettings));
    }
}

const initialFormData = {
    adSetParams: {
        bidAmountCents: '',
        optimizationGoal: '',
        billingEvent: '',
        dailyBudgetCents: '',
        bidStrategy: '',
        status: '',
        adSetTargeting: {
            age_min: '',
            age_max: '',
            genders: [],
        },
    },
    adCreativeParams: {
        videoTitle: '',
        videoMessage: '',
        linkDescription: '',
        urlTrackingTags: '',
        ctaType: 'LEARN_MORE',
        ctaLinkValue: '',
    },
};

function updateNestedField(obj, keys, updateFn) {
    if (!keys.length) return obj;
    const [firstKey, ...restKeys] = keys;
    if (restKeys.length === 0) {
        return { ...obj, [firstKey]: updateFn(obj[firstKey]) };
    }
    return {
        ...obj,
        [firstKey]: updateNestedField(obj[firstKey] || {}, restKeys, updateFn),
    };
}

function AdSettingsForm() {
    const styles = {
        container: {
            fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif',
            boxSizing: 'border-box',
            padding: '0 20px',
        },
        header: {
            textAlign: 'center',
            marginBottom: '20px',
        },
        form: {
            width: '100%',
        },
        fieldset: {
            border: '1px solid #ccc',
            padding: '15px',
            borderRadius: '5px',
            marginBottom: '20px',
        },
        legend: {
            fontWeight: 'bold',
            padding: '0 10px',
            color: '#007BFF',
        },
        label: {
            display: 'block',
            fontWeight: '500',
            marginBottom: '5px',
        },
        input: {
            width: '100%',
            padding: '8px',
            border: '1px solid #ccc',
            borderRadius: '4px',
            marginBottom: '10px',
            boxSizing: 'border-box',
        },
        select: {
            width: '100%',
            padding: '8px 30px 8px 8px',
            border: '1px solid #ccc',
            borderRadius: '4px',
            marginBottom: '10px',
            boxSizing: 'border-box',
            ...commonSelectArrowStyles,
        },
        textarea: {
            width: '100%',
            padding: '8px',
            border: '1px solid #ccc',
            borderRadius: '4px',
            marginBottom: '10px',
            minHeight: '80px',
            boxSizing: 'border-box',
            resize: 'vertical',
        },
        checkbox: {
            marginRight: '5px',
        },
        buttonsContainer: {
            marginTop: '1rem',
            textAlign: 'center',
        },
        button: {
            padding: '10px 20px',
            marginRight: '10px',
            border: 'none',
            borderRadius: '4px',
            backgroundColor: '#007BFF',
            color: '#fff',
            cursor: 'pointer',
        },
        buttonCancel: {
            padding: '10px 20px',
            border: 'none',
            borderRadius: '4px',
            backgroundColor: '#dc3545',
            color: '#fff',
            cursor: 'pointer',
        },
    };

    const [isFormEditable, setIsFormEditable] = useState(false);
    const [currentFormData, setCurrentFormData] = useState(initialFormData);
    const [accountId, setAccountId] = useState('12345');
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        setIsFormEditable(false);
        setCurrentFormData(initialFormData);

        async function loadAdSettings() {
            try {
                const fbAdSettings = await getFbAdSettings(accountId);
                if (fbAdSettings) {
                    setCurrentFormData(deepCopyFbAdSettings(fbAdSettings));
                }
            } catch (error) {
                handleError(error, 'Error loading ad settings');
            }
        }

        if (accountId) {
            loadAdSettings();
        }
    }, [accountId]);

    const handleInputChange = (event) => {
        const { name, value, type, checked } = event.target;
        const keys = name.split('.');
        setCurrentFormData((prev) => {
            if (keys.length === 1) {
                return {
                    ...prev,
                    [name]:
                        type === 'checkbox' ? (checked ? value : false) : value,
                };
            }
            return updateNestedField(prev, keys, (oldValue) => {
                if (type === 'checkbox') {
                    const arr = Array.isArray(oldValue) ? [...oldValue] : [];
                    if (checked) {
                        if (!arr.includes(value)) arr.push(value);
                    } else {
                        return arr.filter((item) => item !== value);
                    }
                    return arr;
                }
                return value;
            });
        });
    };

    const handleSave = async (event) => {
        event.preventDefault();
        setIsSaving(true);
        try {
            const updatedFbAdSettings = deepCopyFbAdSettings(currentFormData);

            if (
                !updatedFbAdSettings.adSetParams ||
                !updatedFbAdSettings.adSetParams.adSetTargeting ||
                !updatedFbAdSettings.adSetParams.adSetTargeting.genders ||
                updatedFbAdSettings.adSetParams.adSetTargeting.genders
                    .length === 0
            ) {
                throw new Error('Please select at least one gender option');
            }

            updatedFbAdSettings.campaignParams = {
                objective: 'OUTCOME_SALES',
                status: 'ACTIVE',
            };

            await saveFbAdSettings(accountId, updatedFbAdSettings);
            setCurrentFormData(deepCopyFbAdSettings(updatedFbAdSettings));
            setIsFormEditable(false);
            alert('Changes saved successfully!');
        } catch (error) {
            handleError(error, 'Error saving ad settings');
        } finally {
            setIsSaving(false);
        }
    };

    const handleEdit = (event) => {
        event.preventDefault();
        setIsFormEditable(true);
    };

    const handleCancel = (event) => {
        event.preventDefault();
        setIsFormEditable(false);
    };

    return (
        <div style={styles.container}>
            <h1 style={styles.header}>Ad Settings Form</h1>
            <form onSubmit={handleSave} style={styles.form}>
                <fieldset style={styles.fieldset}>
                    <legend style={styles.legend}>Account Details</legend>
                    <div>
                        <label style={styles.label}>
                            Account ID:
                            <select
                                value={accountId}
                                onChange={(e) => setAccountId(e.target.value)}
                                style={styles.select}
                            >
                                <option value="">Select Account</option>
                                <option value="916987259877684">
                                    916987259877684 (Ozempic, SF- 121 (EST) -
                                    Ronin WH 262 - TN_RN_FB_ABG-999019)
                                </option>
                                <option value="467161346185440">
                                    467161346185440 (Roofing, Vincent x
                                    Digitsolution CC 1)
                                </option>
                                <option value="8653880687969127">
                                    8653880687969127 (Roofing, Vincent x
                                    Digitsolution CC 2)
                                </option>
                                <option value="12345">TEST</option>
                            </select>
                        </label>
                    </div>
                </fieldset>

                <fieldset style={styles.fieldset}>
                    <legend style={styles.legend}>Ad Set Parameters</legend>
                    <div>
                        <label style={styles.label}>
                            Bid Amount (Cents):
                            <input
                                type="number"
                                name="adSetParams.bidAmountCents"
                                value={
                                    currentFormData.adSetParams
                                        ?.bidAmountCents || ''
                                }
                                onChange={handleInputChange}
                                disabled={!isFormEditable}
                                style={styles.input}
                            />
                        </label>
                    </div>
                    <div>
                        <label style={styles.label}>
                            Optimization Goal:
                            <input
                                type="text"
                                name="adSetParams.optimizationGoal"
                                value={
                                    currentFormData.adSetParams
                                        ?.optimizationGoal || ''
                                }
                                onChange={handleInputChange}
                                disabled={!isFormEditable}
                                style={styles.input}
                            />
                        </label>
                    </div>
                    <div>
                        <label style={styles.label}>
                            Billing Event:
                            <input
                                type="text"
                                name="adSetParams.billingEvent"
                                value={
                                    currentFormData.adSetParams?.billingEvent ||
                                    ''
                                }
                                onChange={handleInputChange}
                                disabled={!isFormEditable}
                                style={styles.input}
                            />
                        </label>
                    </div>
                    <div>
                        <label style={styles.label}>
                            Daily Budget (Cents):
                            <input
                                type="number"
                                name="adSetParams.dailyBudgetCents"
                                value={
                                    currentFormData.adSetParams
                                        ?.dailyBudgetCents || ''
                                }
                                onChange={handleInputChange}
                                disabled={!isFormEditable}
                                style={styles.input}
                            />
                        </label>
                    </div>
                    <div>
                        <label style={styles.label}>
                            Bid Strategy:
                            <input
                                type="text"
                                name="adSetParams.bidStrategy"
                                value={
                                    currentFormData.adSetParams?.bidStrategy ||
                                    ''
                                }
                                onChange={handleInputChange}
                                disabled={!isFormEditable}
                                style={styles.input}
                            />
                        </label>
                    </div>
                    <div>
                        <label style={styles.label}>
                            Status:
                            <select
                                name="adSetParams.status"
                                value={
                                    currentFormData.adSetParams?.status || ''
                                }
                                onChange={handleInputChange}
                                disabled={!isFormEditable}
                                style={styles.select}
                            >
                                <option value="ACTIVE">Active</option>
                                <option value="PAUSED">Paused</option>
                            </select>
                        </label>
                    </div>
                    <fieldset style={styles.fieldset}>
                        <legend style={styles.legend}>Ad Set Targeting</legend>
                        <div>
                            <label style={styles.label}>
                                Minimum Age:
                                <input
                                    type="number"
                                    name="adSetParams.adSetTargeting.age_min"
                                    value={
                                        currentFormData.adSetParams
                                            ?.adSetTargeting?.age_min || ''
                                    }
                                    onChange={handleInputChange}
                                    disabled={!isFormEditable}
                                    style={styles.input}
                                />
                            </label>
                        </div>
                        <div>
                            <label style={styles.label}>
                                Maximum Age:
                                <input
                                    type="number"
                                    name="adSetParams.adSetTargeting.age_max"
                                    value={
                                        currentFormData.adSetParams
                                            ?.adSetTargeting?.age_max || ''
                                    }
                                    onChange={handleInputChange}
                                    disabled={!isFormEditable}
                                    style={styles.input}
                                />
                            </label>
                        </div>
                        <div>
                            <label style={styles.label}>Genders:</label>
                            <label style={{ marginRight: '15px' }}>
                                <input
                                    type="checkbox"
                                    name="adSetParams.adSetTargeting.genders"
                                    value="1"
                                    onChange={handleInputChange}
                                    disabled={!isFormEditable}
                                    checked={
                                        currentFormData.adSetParams
                                            ?.adSetTargeting?.genders
                                            ? currentFormData.adSetParams.adSetTargeting.genders.includes(
                                                  '1'
                                              )
                                            : false
                                    }
                                    style={styles.checkbox}
                                />
                                Male
                            </label>
                            <label>
                                <input
                                    type="checkbox"
                                    name="adSetParams.adSetTargeting.genders"
                                    value="2"
                                    onChange={handleInputChange}
                                    disabled={!isFormEditable}
                                    checked={
                                        currentFormData.adSetParams
                                            ?.adSetTargeting?.genders
                                            ? currentFormData.adSetParams.adSetTargeting.genders.includes(
                                                  '2'
                                              )
                                            : false
                                    }
                                    style={styles.checkbox}
                                />
                                Female
                            </label>
                        </div>
                    </fieldset>
                </fieldset>

                <fieldset style={styles.fieldset}>
                    <legend style={styles.legend}>
                        Ad Creative Parameters
                    </legend>
                    <div>
                        <label style={styles.label}>
                            Video Title:
                            <input
                                type="text"
                                name="adCreativeParams.videoTitle"
                                value={
                                    currentFormData.adCreativeParams
                                        ?.videoTitle || ''
                                }
                                onChange={handleInputChange}
                                disabled={!isFormEditable}
                                style={styles.input}
                            />
                        </label>
                    </div>
                    <div>
                        <label style={styles.label}>
                            Video Message:
                            <textarea
                                name="adCreativeParams.videoMessage"
                                value={
                                    currentFormData.adCreativeParams
                                        ?.videoMessage || ''
                                }
                                onChange={handleInputChange}
                                disabled={!isFormEditable}
                                style={{
                                    ...styles.textarea,
                                    minHeight: '200px',
                                }}
                            ></textarea>
                        </label>
                    </div>
                    <div>
                        <label style={styles.label}>
                            Link Description:
                            <input
                                type="text"
                                name="adCreativeParams.linkDescription"
                                value={
                                    currentFormData.adCreativeParams
                                        ?.linkDescription || ''
                                }
                                onChange={handleInputChange}
                                disabled={!isFormEditable}
                                style={styles.input}
                            />
                        </label>
                    </div>
                    <div>
                        <label style={styles.label}>
                            URL Tracking Tags:
                            <textarea
                                name="adCreativeParams.urlTrackingTags"
                                value={
                                    currentFormData.adCreativeParams
                                        ?.urlTrackingTags || ''
                                }
                                onChange={handleInputChange}
                                disabled={!isFormEditable}
                                style={{
                                    ...styles.textarea,
                                    minHeight: '100px',
                                }}
                            ></textarea>
                        </label>
                    </div>
                    <div>
                        <label style={styles.label}>
                            Call To Action Type:
                            <select
                                name="adCreativeParams.ctaType"
                                value={
                                    currentFormData.adCreativeParams?.ctaType ||
                                    'LEARN_MORE'
                                }
                                onChange={handleInputChange}
                                disabled={!isFormEditable}
                                style={styles.select}
                            >
                                <option value="LEARN_MORE">Learn More</option>
                                <option value="SHOP_NOW">Shop Now</option>
                                <option value="SIGN_UP">Sign Up</option>
                            </select>
                        </label>
                    </div>
                    <div>
                        <label style={styles.label}>
                            Website URL:
                            <input
                                type="text"
                                name="adCreativeParams.ctaLinkValue"
                                value={
                                    currentFormData.adCreativeParams
                                        ?.ctaLinkValue || ''
                                }
                                onChange={handleInputChange}
                                disabled={!isFormEditable}
                                style={styles.input}
                            />
                        </label>
                    </div>
                </fieldset>

                <div style={styles.buttonsContainer}>
                    {isFormEditable ? (
                        <div>
                            <button
                                type="submit"
                                style={styles.button}
                                disabled={isSaving}
                            >
                                {isSaving ? 'Saving...' : 'Save Changes'}
                            </button>
                            <button
                                type="button"
                                onClick={handleCancel}
                                style={styles.buttonCancel}
                                disabled={isSaving}
                            >
                                Cancel
                            </button>
                        </div>
                    ) : (
                        <button
                            type="button"
                            onClick={handleEdit}
                            style={styles.button}
                        >
                            Edit
                        </button>
                    )}
                </div>
            </form>
        </div>
    );
}

export default AdSettingsForm;
