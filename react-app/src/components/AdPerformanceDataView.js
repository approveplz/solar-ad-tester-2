import React, { useEffect, useState } from 'react';
import { getAdPerformanceFirestoreAll } from '../firebase.js';
import { formatCurrency, formatROI } from '../helpers.js';
import VideoPreviewPlayer from './VideoPreviewPlayer.js';

const cardStyles = {
    container: {
        backgroundColor: '#f8f9fa',
        borderRadius: '8px',
        padding: '20px',
    },
    header: {
        fontSize: '1.2em',
        fontWeight: 'bold',
        marginBottom: '15px',
        color: '#007BFF',
    },
    row: {
        display: 'flex',
        justifyContent: 'space-between',
        margin: '5px 0',
    },
    label: {
        color: '#6c757d',
    },
    value: {
        fontWeight: '500',
    },
};

// Renders a group of metrics, such as "Last 3 Days"
const MetricsGroup = ({ groupName, data }) => (
    <div>
        <div
            style={{
                ...cardStyles.header,
                marginBottom: '10px',
                fontSize: '1em',
            }}
        >
            {groupName}
        </div>
        <div style={cardStyles.row}>
            <span style={cardStyles.label}>Spend:</span>
            <span style={cardStyles.value}>{formatCurrency(data?.spend)}</span>
        </div>
        <div style={cardStyles.row}>
            <span style={cardStyles.label}>Revenue:</span>
            <span style={cardStyles.value}>
                {formatCurrency(data?.revenue)}
            </span>
        </div>
        <div style={cardStyles.row}>
            <span style={cardStyles.label}>ROI:</span>
            <span style={cardStyles.value}>{formatROI(data?.roi)}</span>
        </div>
        <div style={cardStyles.row}>
            <span style={cardStyles.label}>Leads:</span>
            <span style={cardStyles.value}>{data?.leads ?? '-'}</span>
        </div>
        <div style={cardStyles.row}>
            <span style={cardStyles.label}>Clicks:</span>
            <span style={cardStyles.value}>{data?.clicks ?? '-'}</span>
        </div>
    </div>
);

const MetricsCard = ({ title, data }) => (
    <div style={cardStyles.container}>
        <div style={cardStyles.header}>{title}</div>
        <MetricsGroup groupName="Last 3 Days" data={data?.last3Days} />
        <MetricsGroup groupName="Last 7 Days" data={data?.last7Days} />
        <MetricsGroup groupName="Lifetime" data={data?.lifetime} />
    </div>
);

const AdInfoCard = ({ ad }) => (
    <div style={cardStyles.container}>
        <div style={cardStyles.header}>Ad Information</div>
        <div style={cardStyles.row}>
            <span style={cardStyles.label}>Active on Facebook:</span>
            <span style={cardStyles.value}>{ad.fbIsActive ? 'Yes' : 'No'}</span>
        </div>
        <div style={cardStyles.row}>
            <span style={cardStyles.label}>Download URL:</span>
            <span style={cardStyles.value}>
                <a
                    href={ad.gDriveDownloadUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    Download
                </a>
            </span>
        </div>
        <div style={cardStyles.row}>
            <span style={cardStyles.label}>Already Scaled:</span>
            <span style={cardStyles.value}>{ad.hasScaled ? 'Yes' : 'No'}</span>
        </div>
        <div style={cardStyles.row}>
            <span style={cardStyles.label}>Hooks Made:</span>
            <span style={cardStyles.value}>
                {ad.hasHooksCreated ? 'Yes' : 'No'}
            </span>
        </div>
        <div style={cardStyles.row}>
            <span style={cardStyles.label}>FB Ad Account:</span>
            <span style={cardStyles.value}>{ad.fbAccountId}</span>
        </div>
        <div style={cardStyles.row}>
            <span style={cardStyles.label}>FB Ad ID:</span>
            <span style={cardStyles.value}>{ad.fbAdId}</span>
        </div>
        <div style={cardStyles.row}>
            <span style={cardStyles.label}>FB Ad Set ID:</span>
            <span style={cardStyles.value}>{ad.fbAdSetId}</span>
        </div>
        <div style={{ marginTop: '15px' }}>
            <VideoPreviewPlayer videoUrl={ad.gDriveDownloadUrl} />
        </div>
    </div>
);

const ExpandedAdRow = ({ metrics, ad }) => (
    <>
        <div
            style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '20px',
            }}
        >
            <MetricsCard title="Facebook Metrics" data={metrics?.fb} />
            <MetricsCard title="Google Analytics Metrics" data={metrics?.ga} />
            <AdInfoCard ad={ad} />
        </div>
    </>
);

const AdRow = ({ ad }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const cellStyle = {
        border: '1px solid #ddd',
        padding: '8px',
        textAlign: 'center',
    };

    return (
        <>
            <tr
                onClick={() => setIsExpanded(!isExpanded)}
                style={{
                    cursor: 'pointer',
                    backgroundColor: isExpanded ? '#f5f5f5' : 'white',
                }}
            >
                <td style={cellStyle}>{ad.adName}</td>
                <td style={cellStyle}>{ad.vertical}</td>
                <td style={cellStyle}>
                    {ad.performanceMetrics?.fb?.lifetime?.spend != null
                        ? formatCurrency(
                              ad.performanceMetrics.fb.lifetime.spend
                          )
                        : '-'}
                </td>
                <td style={cellStyle}>
                    {ad.performanceMetrics?.fb?.lifetime?.revenue != null
                        ? formatCurrency(
                              ad.performanceMetrics.fb.lifetime.revenue
                          )
                        : '-'}
                </td>
                <td style={cellStyle}>
                    {formatROI(ad.performanceMetrics?.fb?.lifetime?.roi)}
                </td>
                <td style={cellStyle}>
                    {ad.performanceMetrics?.fb?.lifetime?.leads ?? '-'}
                </td>
                <td style={cellStyle}>
                    {ad.performanceMetrics?.fb?.lifetime?.clicks ?? '-'}
                </td>
            </tr>
            {isExpanded && (
                <tr>
                    <td
                        colSpan="7"
                        style={{ padding: '20px', border: '1px solid #ddd' }}
                    >
                        <ExpandedAdRow
                            metrics={ad.performanceMetrics}
                            ad={ad}
                        />
                    </td>
                </tr>
            )}
        </>
    );
};

function AdPerformanceDataView() {
    const [adData, setAdData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const data = await getAdPerformanceFirestoreAll();
                setAdData(data);
            } catch (err) {
                console.error(err);
                setError('Failed to fetch ad performance data.');
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    const containerStyle = {
        fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif',
        boxSizing: 'border-box',
        padding: '20px',
    };

    const headerStyle = {
        textAlign: 'center',
        marginBottom: '20px',
    };

    const tableStyle = {
        width: '100%',
        borderCollapse: 'collapse',
        margin: '20px auto',
    };

    const thStyle = {
        border: '1px solid #ddd',
        padding: '12px 8px',
        backgroundColor: '#007BFF',
        color: '#fff',
        textAlign: 'center',
        fontWeight: 'bold',
    };

    return (
        <div style={containerStyle}>
            <h1 style={headerStyle}>Ad Performance Data</h1>
            {loading ? (
                <p>Loading...</p>
            ) : error ? (
                <p style={{ color: 'red' }}>{error}</p>
            ) : (
                <table style={tableStyle}>
                    <thead>
                        <tr>
                            <th style={thStyle}>Ad Name</th>
                            <th style={thStyle}>Vertical</th>
                            <th style={thStyle}>FB Lifetime Spend</th>
                            <th style={thStyle}>FB Lifetime Revenue</th>
                            <th style={thStyle}>FB Lifetime ROI</th>
                            <th style={thStyle}>FB Lifetime Leads</th>
                            <th style={thStyle}>FB Lifetime Clicks</th>
                        </tr>
                    </thead>
                    <tbody>
                        {adData.map((ad, index) => (
                            <AdRow key={index} ad={ad} />
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    );
}

export default AdPerformanceDataView;
