import React from 'react';

function Instructions() {
    const styles = {
        container: {
            display: 'flex',
            justifyContent: 'center',
            padding: '20px',
            backgroundColor: '#f8f9fa',
            fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif',
        },
        card: {
            width: '100%',
            maxWidth: '850px',
            backgroundColor: '#fff',
            borderRadius: '8px',
            padding: '20px',
            boxShadow: '0 4px 8px rgba(0, 0, 0, 0.1)',
        },
        header: {
            textAlign: 'center',
            marginBottom: '20px',
            color: '#007BFF',
        },
        content: {
            fontSize: '16px',
            lineHeight: '1.6',
        },
        pre: {
            backgroundColor: '#f5f5f5',
            padding: '10px',
            borderRadius: '4px',
            overflowX: 'auto',
            fontSize: '16px',
        },
    };

    return (
        <div style={styles.container}>
            <div style={styles.card}>
                <h1 style={styles.header}>Overview</h1>
                <div style={styles.content}>
                    <p>
                        Welcome to our Ads Manager! This app streamlines
                        Facebook ad campaigns with three main features:
                    </p>
                    <ul>
                        <li>
                            <strong>Settings:</strong> Set up your ads with
                            targeting, bids, and creative elements.
                        </li>
                        <li>
                            <strong>Performance:</strong> Monitor detailed
                            metrics from Facebook and Google Analytics.
                        </li>
                        <li>
                            <strong>Automation:</strong> The system tests ad
                            hooks and scales winning ads automatically.
                        </li>
                    </ul>
                    <p>
                        To begin, adjust your ad settings and then switch to the
                        Performance view to track your ads.
                    </p>
                </div>
                <h1 style={styles.header}>Getting Started</h1>
                <div style={styles.content}>
                    <p>
                        To begin running ads, you'll need to place your video
                        assets in this folder:
                    </p>
                    <p>
                        <a
                            href="https://drive.google.com/file/d/1ZwQrMZnb8ieczQHHOTUcmyZEjuGGwODf/view?usp=drive_link"
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            https://drive.google.com/file/d/1ZwQrMZnb8ieczQHHOTUcmyZEjuGGwODf/view?usp=drive_link
                        </a>
                    </p>
                    <p>
                        The filename should follow the naming convention
                        detailed below. The system will automatically detect the
                        vertical (e.g. Roofing, Ozempic) from the filename and
                        apply the corresponding settings that you've configured
                        in the Settings form for that vertical.
                    </p>
                    <p>
                        Files placed in the folder are processed automatically
                        every 30 minutes. When a file is processed:
                    </p>
                    <ul>
                        <li>
                            If your ad settings are set to "Active" in the
                            Settings view, the ad will begin running on the next
                            business day
                        </li>
                        <li>
                            The video file will be moved to an ARCHIVE folder
                            within the same Google Drive location
                        </li>
                        <li>
                            You'll be able to monitor the ad's performance in
                            the Performance view once it starts running
                        </li>
                    </ul>
                </div>
                <h1 style={styles.header}>Naming Convention</h1>
                <div style={styles.content}>
                    <p>
                        We use a naming convention to help us keep track of our
                        ads. The format is:
                    </p>
                    <pre style={styles.pre}>
                        <span style={{ color: '#007BFF', fontWeight: 'bold' }}>
                            {'{VERTICAL_CODE}'}
                        </span>
                        <span>-</span>
                        <span style={{ color: '#007BFF', fontWeight: 'bold' }}>
                            {'{AD_CODE_SCRIPT_WRITER}'}
                        </span>
                        <span>-</span>
                        <span style={{ color: '#007BFF', fontWeight: 'bold' }}>
                            {'{AD_CODE_IDEA_CREATOR}'}
                        </span>
                        <span>-</span>
                        <span style={{ color: '#007BFF', fontWeight: 'bold' }}>
                            {'{AD_CODE_HOOK_WRITER}'}
                        </span>
                    </pre>
                    <p>
                        The system will automatically prepend an incrementing
                        number to the beginning of the filename. For example, if
                        you upload a file named:
                    </p>
                    <pre style={styles.pre}>R-AZ-AZ-AZ.mp4</pre>
                    <p>The system will rename it to:</p>
                    <pre style={styles.pre}>101-R-AZ-AZ-AZ</pre>
                    <p>
                        This helps maintain a clear chronological order of
                        uploaded ads.
                    </p>
                    <p>
                        When creating multiple ads, you can add any text you
                        want at the end of the filename to help distinguish
                        between them — the system will automatically remove
                        anything after the standard naming format. For example,
                        you could name your files in the Google Drive folder:
                    </p>
                    <pre style={styles.pre}>R-AZ-AZ-AZ-version1.mp4</pre>
                    <pre style={styles.pre}>R-AZ-AZ-AZ-12.mp4</pre>
                    <pre style={styles.pre}>R-AZ-AZ-AZ-test3.mp4</pre>
                </div>
            </div>
        </div>
    );
}

export default Instructions;
