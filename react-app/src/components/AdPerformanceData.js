import React, { useEffect, useState } from 'react';
// adjust the import path below based on your project structure
import { getAdPerformanceFirestoreAll } from '../firebase.js';

const ExpandedMetrics = ({ metrics }) => {
    const styles = {
        container: {
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '20px',
            padding: '20px',
            backgroundColor: '#f5f5f5',
        },
        platform: {
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
        metricsGroup: {
            marginBottom: '20px',
        },
        metricsHeader: {
            fontWeight: 'bold',
            marginBottom: '10px',
            color: '#495057',
        },
        metricRow: {
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

    const renderMetrics = (timeMetrics, label) => {
        return (
            <div style={styles.metricsGroup}>
                <div style={styles.metricsHeader}>{label}</div>
                <div style={styles.metricRow}>
                    <span style={styles.label}>Spend:</span>
                    <span style={styles.value}>
                        {timeMetrics?.spend ?? 'N/A'}
                    </span>
                </div>
                <div style={styles.metricRow}>
                    <span style={styles.label}>Revenue:</span>
                    <span style={styles.value}>
                        {timeMetrics?.revenue ?? 'N/A'}
                    </span>
                </div>
                <div style={styles.metricRow}>
                    <span style={styles.label}>ROI:</span>
                    <span style={styles.value}>
                        {timeMetrics?.roi ?? 'N/A'}
                    </span>
                </div>
                <div style={styles.metricRow}>
                    <span style={styles.label}>Leads:</span>
                    <span style={styles.value}>
                        {timeMetrics?.leads ?? 'N/A'}
                    </span>
                </div>
                <div style={styles.metricRow}>
                    <span style={styles.label}>Clicks:</span>
                    <span style={styles.value}>
                        {timeMetrics?.clicks ?? 'N/A'}
                    </span>
                </div>
            </div>
        );
    };

    const renderPlatformMetrics = (platformData, platformName) => {
        return (
            <div style={styles.platform}>
                <div style={styles.header}>{platformName} Metrics</div>
                {renderMetrics(platformData?.last3Days, 'Last 3 Days')}
                {renderMetrics(platformData?.last7Days, 'Last 7 Days')}
                {renderMetrics(platformData?.lifetime, 'Lifetime')}
            </div>
        );
    };

    return (
        <div style={styles.container}>
            {renderPlatformMetrics(metrics?.fb, 'Facebook')}
            {renderPlatformMetrics(metrics?.ga, 'Google Analytics')}
        </div>
    );
};

const AdRow = ({ ad }) => {
    const [isExpanded, setIsExpanded] = useState(false);

    const styles = {
        td: {
            border: '1px solid #ddd',
            padding: '8px',
            textAlign: 'center',
        },
    };

    return (
        <React.Fragment>
            <tr
                onClick={() => setIsExpanded(!isExpanded)}
                style={{
                    cursor: 'pointer',
                    backgroundColor: isExpanded ? '#f5f5f5' : 'white',
                }}
            >
                <td style={styles.td}>{ad.adName}</td>
                <td style={styles.td}>{ad.vertical}</td>
                <td style={styles.td}>
                    <a
                        href={ad.gDriveDownloadUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        Download
                    </a>
                </td>
                <td style={styles.td}>
                    {ad.performanceMetrics?.fb?.lifetime?.spend ?? 'N/A'}
                </td>
                <td style={styles.td}>
                    {ad.performanceMetrics?.fb?.lifetime?.revenue ?? 'N/A'}
                </td>
                <td style={styles.td}>
                    {ad.performanceMetrics?.fb?.lifetime?.roi ?? 'N/A'}
                </td>
                <td style={styles.td}>
                    {ad.performanceMetrics?.fb?.lifetime?.leads ?? 'N/A'}
                </td>
                <td style={styles.td}>
                    {ad.performanceMetrics?.fb?.lifetime?.clicks ?? 'N/A'}
                </td>
            </tr>
            {isExpanded && (
                <tr>
                    <td
                        colSpan="8"
                        style={{
                            padding: '20px',
                            border: '1px solid #ddd',
                        }}
                    >
                        <ExpandedMetrics metrics={ad.performanceMetrics} />
                    </td>
                </tr>
            )}
        </React.Fragment>
    );
};

function AdPerformanceData() {
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

    const styles = {
        container: {
            fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif',
            boxSizing: 'border-box',
            padding: '20px',
        },
        header: {
            textAlign: 'center',
            marginBottom: '20px',
        },
        table: {
            width: '100%',
            borderCollapse: 'collapse',
            margin: '20px auto',
        },
        th: {
            border: '1px solid #ddd',
            padding: '12px 8px',
            backgroundColor: '#007BFF',
            color: '#fff',
            textAlign: 'center',
            fontWeight: 'bold',
        },
        td: {
            border: '1px solid #ddd',
            padding: '8px',
            textAlign: 'center',
        },
    };

    return (
        <div style={styles.container}>
            <h1 style={styles.header}>Ad Performance Data</h1>
            {loading ? (
                <p>Loading...</p>
            ) : error ? (
                <p style={{ color: 'red' }}>{error}</p>
            ) : (
                <table style={styles.table}>
                    <thead>
                        <tr>
                            <th style={styles.th}>Ad Name</th>
                            <th style={styles.th}>Vertical</th>
                            <th style={styles.th}>Video</th>
                            <th style={styles.th}>FB Lifetime Spend</th>
                            <th style={styles.th}>FB Lifetime Revenue</th>
                            <th style={styles.th}>FB Lifetime ROI</th>
                            <th style={styles.th}>FB Lifetime Leads</th>
                            <th style={styles.th}>FB Lifetime Clicks</th>
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

export default AdPerformanceData;
