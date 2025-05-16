import React, { useState, useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { produce } from 'immer';
import { saveFbAdSettings, getFbAdSettings } from '../firebase.js';
import { commonSelectArrowStyles } from '../styles/selectStyles';

function handleError(error, customMessage = 'An error occurred') {
    console.error(customMessage, error);
    alert(`${customMessage}: ${error.message}`);
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
            geo_locations: {
                zips: [],
                location_types: ['home', 'recent'],
            },
        },
    },
    promotedObjectParams: {
        pixelId: '',
        customEventType: 'LEAD',
        customEventStr: '',
        pageId: '',
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
        error: {
            color: 'red',
            fontSize: '14px',
            marginTop: '-5px',
            marginBottom: '10px',
        },
    };

    // UI state management
    const [isFormEditable, setIsFormEditable] = useState(false);
    const [accountId, setAccountId] = useState('822357702553382');
    const [isSaving, setIsSaving] = useState(false);
    // State to hold the zipcodes textarea value
    const [zipCodesText, setZipCodesText] = useState('');

    // Form state management with React Hook Form
    const {
        control,
        handleSubmit,
        reset,
        watch,
        setValue,
        formState: { errors },
    } = useForm({
        defaultValues: initialFormData,
    });

    // Watch the genders field to validate selection
    const genders = watch('adSetParams.adSetTargeting.genders', []);

    // Load ad settings when account changes
    useEffect(() => {
        setIsFormEditable(false);
        reset(initialFormData);
        setZipCodesText('');

        async function loadAdSettings() {
            try {
                const fbAdSettings = await getFbAdSettings(accountId);
                if (fbAdSettings) {
                    // Convert zips array to CSV string for display
                    if (
                        fbAdSettings.adSetParams?.adSetTargeting?.geo_locations
                            ?.zips?.length
                    ) {
                        // Extract just the zipcode part from the key (strip "US:" prefix)
                        const zipCodesText =
                            fbAdSettings.adSetParams.adSetTargeting.geo_locations.zips
                                .map((zip) => zip.key.replace('US:', ''))
                                .join(',');
                        setZipCodesText(zipCodesText);
                    } else {
                        setZipCodesText('');
                    }

                    // Reset the form with the loaded data
                    reset(fbAdSettings);
                }
            } catch (error) {
                handleError(error, 'Error loading ad settings');
            }
        }

        if (accountId) {
            loadAdSettings();
        }
    }, [accountId, reset]);

    // Parse CSV or line break-separated values to array and update form values
    const handleZipCodesChange = (value) => {
        setZipCodesText(value);

        // Normalize input by replacing line breaks with commas
        const normalizedInput = value.replace(/[\n,]+/g, ',');

        // Parse into an array of zip code objects matching the interface
        const zipsArray = normalizedInput
            .split(',')
            .map((zip) => zip.trim())
            .filter((zip) => zip !== '')
            .map((zip) => {
                // Remove any "US:" prefix if the user manually entered it
                const cleanZip = zip.replace(/^US:/i, '');
                return {
                    key: `US:${cleanZip}`, // Format with US prefix as per interface
                };
            });

        // Get current geo_locations value
        const currentGeoLocations =
            watch('adSetParams.adSetTargeting.geo_locations') || {};

        // Only update the zips property, preserving all other properties
        setValue('adSetParams.adSetTargeting.geo_locations', {
            ...currentGeoLocations,
            zips: zipsArray,
        });
    };

    // Form submission handler
    const onSubmit = async (data) => {
        setIsSaving(true);
        try {
            // Use Immer to safely update the campaign params
            const updatedFbAdSettings = produce(data, (draft) => {
                // Add required campaign params
                draft.campaignParams = {
                    objective: 'OUTCOME_SALES',
                    status: 'ACTIVE',
                };

                // Make sure geo_locations and zips are properly initialized
                if (!draft.adSetParams.adSetTargeting.geo_locations) {
                    draft.adSetParams.adSetTargeting.geo_locations = {
                        zips: [],
                    };
                } else if (
                    !Array.isArray(
                        draft.adSetParams.adSetTargeting.geo_locations.zips
                    )
                ) {
                    draft.adSetParams.adSetTargeting.geo_locations.zips = [];
                }
            });

            if (
                !updatedFbAdSettings.adSetParams?.adSetTargeting?.genders
                    ?.length
            ) {
                throw new Error('Please select at least one gender option');
            }

            console.log('Saving form data:', updatedFbAdSettings);

            await saveFbAdSettings(accountId, updatedFbAdSettings);
            reset(updatedFbAdSettings);
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
            <form onSubmit={handleSubmit(onSubmit)} style={styles.form}>
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
                                <option value="358423827304360">
                                    358423827304360 (Roofing, Vincent x
                                    Digitsolution CC 2 New)
                                </option>
                                <option value="822357702553382">
                                    822357702553382 (AWL_RN_FB_ABG-999490)
                                </option>
                                <option value="467161346185440">
                                    467161346185440 (Roofing, Vincent x
                                    Digitsolution CC 1)
                                </option>
                            </select>
                        </label>
                    </div>
                </fieldset>

                <fieldset style={styles.fieldset}>
                    <legend style={styles.legend}>Ad Set Parameters</legend>
                    <div>
                        <label style={styles.label}>
                            Bid Amount/Cost Per Result Goal (Cents):
                            <Controller
                                name="adSetParams.bidAmountCents"
                                control={control}
                                render={({ field }) => (
                                    <input
                                        {...field}
                                        type="number"
                                        disabled={!isFormEditable}
                                        style={styles.input}
                                    />
                                )}
                            />
                        </label>
                    </div>
                    <div>
                        <label style={styles.label}>
                            Optimization Goal:
                            <Controller
                                name="adSetParams.optimizationGoal"
                                control={control}
                                render={({ field }) => (
                                    <select
                                        {...field}
                                        disabled={!isFormEditable}
                                        style={styles.select}
                                    >
                                        <option value="OFFSITE_CONVERSIONS">
                                            Offsite Conversions
                                        </option>
                                    </select>
                                )}
                            />
                        </label>
                    </div>
                    <div>
                        <label style={styles.label}>
                            Billing Event:
                            <Controller
                                name="adSetParams.billingEvent"
                                control={control}
                                render={({ field }) => (
                                    <select
                                        {...field}
                                        disabled={!isFormEditable}
                                        style={styles.select}
                                    >
                                        <option value="IMPRESSIONS">
                                            Impressions
                                        </option>
                                    </select>
                                )}
                            />
                        </label>
                    </div>
                    <div>
                        <label style={styles.label}>
                            Daily Budget (Cents):
                            <Controller
                                name="adSetParams.dailyBudgetCents"
                                control={control}
                                render={({ field }) => (
                                    <input
                                        {...field}
                                        type="number"
                                        disabled={!isFormEditable}
                                        style={styles.input}
                                    />
                                )}
                            />
                        </label>
                    </div>
                    <div>
                        <label style={styles.label}>
                            Bid Strategy:
                            <Controller
                                name="adSetParams.bidStrategy"
                                control={control}
                                render={({ field }) => (
                                    <select
                                        {...field}
                                        disabled={!isFormEditable}
                                        style={styles.select}
                                    >
                                        <option value="COST_CAP">
                                            Cost Cap
                                        </option>
                                        <option value="LOWEST_COST_WITHOUT_CAP">
                                            Lowest Cost Without Cap
                                        </option>
                                    </select>
                                )}
                            />
                        </label>
                    </div>
                    <div>
                        <label style={styles.label}>
                            Status:
                            <Controller
                                name="adSetParams.status"
                                control={control}
                                render={({ field }) => (
                                    <select
                                        {...field}
                                        disabled={!isFormEditable}
                                        style={styles.select}
                                    >
                                        <option value="ACTIVE">Active</option>
                                        <option value="PAUSED">Paused</option>
                                    </select>
                                )}
                            />
                        </label>
                    </div>
                    <fieldset style={styles.fieldset}>
                        <legend style={styles.legend}>Ad Set Targeting</legend>
                        <div>
                            <label style={styles.label}>
                                Minimum Age:
                                <Controller
                                    name="adSetParams.adSetTargeting.age_min"
                                    control={control}
                                    render={({ field }) => (
                                        <input
                                            {...field}
                                            type="number"
                                            disabled={!isFormEditable}
                                            style={styles.input}
                                        />
                                    )}
                                />
                            </label>
                        </div>
                        <div>
                            <label style={styles.label}>
                                Maximum Age:
                                <Controller
                                    name="adSetParams.adSetTargeting.age_max"
                                    control={control}
                                    render={({ field }) => (
                                        <input
                                            {...field}
                                            type="number"
                                            disabled={!isFormEditable}
                                            style={styles.input}
                                        />
                                    )}
                                />
                            </label>
                        </div>
                        <div>
                            <label style={styles.label}>Genders:</label>
                            <label style={{ marginRight: '15px' }}>
                                <Controller
                                    name="adSetParams.adSetTargeting.genders"
                                    control={control}
                                    render={({ field }) => (
                                        <input
                                            type="checkbox"
                                            value="1"
                                            disabled={!isFormEditable}
                                            style={styles.checkbox}
                                            checked={field.value?.includes('1')}
                                            onChange={(e) => {
                                                const newValue = [
                                                    ...(field.value || []),
                                                ];
                                                if (e.target.checked) {
                                                    if (!newValue.includes('1'))
                                                        newValue.push('1');
                                                } else {
                                                    const index =
                                                        newValue.indexOf('1');
                                                    if (index > -1)
                                                        newValue.splice(
                                                            index,
                                                            1
                                                        );
                                                }
                                                field.onChange(newValue);
                                            }}
                                        />
                                    )}
                                />
                                Male
                            </label>
                            <label>
                                <Controller
                                    name="adSetParams.adSetTargeting.genders"
                                    control={control}
                                    render={({ field }) => (
                                        <input
                                            type="checkbox"
                                            value="2"
                                            disabled={!isFormEditable}
                                            style={styles.checkbox}
                                            checked={field.value?.includes('2')}
                                            onChange={(e) => {
                                                const newValue = [
                                                    ...(field.value || []),
                                                ];
                                                if (e.target.checked) {
                                                    if (!newValue.includes('2'))
                                                        newValue.push('2');
                                                } else {
                                                    const index =
                                                        newValue.indexOf('2');
                                                    if (index > -1)
                                                        newValue.splice(
                                                            index,
                                                            1
                                                        );
                                                }
                                                field.onChange(newValue);
                                            }}
                                        />
                                    )}
                                />
                                Female
                            </label>
                            {genders.length === 0 && isFormEditable && (
                                <div style={styles.error}>
                                    Please select at least one gender
                                </div>
                            )}
                        </div>
                        <div>
                            <label style={styles.label}>
                                Zip Codes (CSV format):
                                <textarea
                                    value={zipCodesText}
                                    onChange={(e) =>
                                        handleZipCodesChange(e.target.value)
                                    }
                                    disabled={!isFormEditable}
                                    style={{
                                        ...styles.textarea,
                                        height: '350px',
                                        overflow: 'auto',
                                        resize: 'none',
                                    }}
                                    placeholder="Enter zip codes separated by commas or line breaks (e.g. 90210,10001 or one per line)"
                                ></textarea>
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
                            <Controller
                                name="adCreativeParams.videoTitle"
                                control={control}
                                render={({ field }) => (
                                    <input
                                        {...field}
                                        type="text"
                                        disabled={!isFormEditable}
                                        style={styles.input}
                                    />
                                )}
                            />
                        </label>
                    </div>
                    <div>
                        <label style={styles.label}>
                            Video Message:
                            <Controller
                                name="adCreativeParams.videoMessage"
                                control={control}
                                render={({ field }) => (
                                    <textarea
                                        {...field}
                                        disabled={!isFormEditable}
                                        style={{
                                            ...styles.textarea,
                                            minHeight: '200px',
                                        }}
                                    ></textarea>
                                )}
                            />
                        </label>
                    </div>
                    <div>
                        <label style={styles.label}>
                            Link Description:
                            <Controller
                                name="adCreativeParams.linkDescription"
                                control={control}
                                render={({ field }) => (
                                    <input
                                        {...field}
                                        type="text"
                                        disabled={!isFormEditable}
                                        style={styles.input}
                                    />
                                )}
                            />
                        </label>
                    </div>
                    <div>
                        <label style={styles.label}>
                            URL Tracking Tags:
                            <Controller
                                name="adCreativeParams.urlTrackingTags"
                                control={control}
                                render={({ field }) => (
                                    <textarea
                                        {...field}
                                        disabled={!isFormEditable}
                                        style={{
                                            ...styles.textarea,
                                            minHeight: '100px',
                                        }}
                                    ></textarea>
                                )}
                            />
                        </label>
                    </div>
                    <div>
                        <label style={styles.label}>
                            Call To Action Type:
                            <Controller
                                name="adCreativeParams.ctaType"
                                control={control}
                                render={({ field }) => (
                                    <select
                                        {...field}
                                        disabled={!isFormEditable}
                                        style={styles.select}
                                    >
                                        <option value="LEARN_MORE">
                                            Learn More
                                        </option>
                                        <option value="SHOP_NOW">
                                            Shop Now
                                        </option>
                                        <option value="SIGN_UP">Sign Up</option>
                                    </select>
                                )}
                            />
                        </label>
                    </div>
                    <div>
                        <label style={styles.label}>
                            Website URL:
                            <Controller
                                name="adCreativeParams.ctaLinkValue"
                                control={control}
                                render={({ field }) => (
                                    <input
                                        {...field}
                                        type="text"
                                        disabled={!isFormEditable}
                                        style={styles.input}
                                    />
                                )}
                            />
                        </label>
                    </div>
                </fieldset>

                <fieldset style={styles.fieldset}>
                    <legend style={styles.legend}>
                        Promoted Object Parameters
                    </legend>
                    <div>
                        <label style={styles.label}>
                            Pixel ID:
                            <Controller
                                name="promotedObjectParams.pixelId"
                                control={control}
                                render={({ field }) => (
                                    <input
                                        {...field}
                                        type="text"
                                        disabled={!isFormEditable}
                                        style={styles.input}
                                    />
                                )}
                            />
                        </label>
                    </div>
                    <div>
                        <label style={styles.label}>
                            Custom Event Type:
                            <Controller
                                name="promotedObjectParams.customEventType"
                                control={control}
                                render={({ field }) => (
                                    <select
                                        {...field}
                                        disabled={!isFormEditable}
                                        style={styles.select}
                                    >
                                        <option value="LEAD">Lead</option>
                                        <option value="OTHER">Other</option>
                                    </select>
                                )}
                            />
                        </label>
                    </div>
                    <div>
                        <label style={styles.label}>
                            Custom Event String:
                            <Controller
                                name="promotedObjectParams.customEventStr"
                                control={control}
                                render={({ field }) => (
                                    <input
                                        {...field}
                                        type="text"
                                        disabled={!isFormEditable}
                                        style={styles.input}
                                        placeholder="e.g. evt_101"
                                    />
                                )}
                            />
                        </label>
                    </div>
                    <div>
                        <label style={styles.label}>
                            Page ID:
                            <Controller
                                name="promotedObjectParams.pageId"
                                control={control}
                                render={({ field }) => (
                                    <input
                                        {...field}
                                        type="text"
                                        disabled={!isFormEditable}
                                        style={styles.input}
                                    />
                                )}
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
