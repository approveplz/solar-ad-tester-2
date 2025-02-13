import React, { useState } from 'react';
import AdSettingsForm from './components/AdSettingsForm';
import AdPerformanceDataView from './components/AdPerformanceData';
import Instructions from './components/Instructions';
import { commonSelectArrowStyles } from './styles/selectStyles';

function App() {
    const [activeView, setActiveView] = useState('instructions');

    const styles = {
        container: {
            margin: '20px auto',
            maxWidth: '1200px',
            padding: '20px',
            boxShadow: '0 0 10px rgba(0,0,0,0.1)',
            borderRadius: '8px',
            backgroundColor: '#fff',
            fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif',
            boxSizing: 'border-box',
        },
        dropdown: {
            width: '250px',
            padding: '12px 36px 12px 16px',
            fontSize: '16px',
            marginBottom: '20px',
            border: '1px solid #007BFF',
            borderRadius: '4px',
            cursor: 'pointer',
            outline: 'none',
            transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
            ...commonSelectArrowStyles,
            backgroundPosition: 'right 16px center',
        },
    };

    const handleViewChange = (event) => {
        setActiveView(event.target.value);
    };

    return (
        <div className="App" style={styles.container}>
            <select
                value={activeView}
                onChange={handleViewChange}
                style={styles.dropdown}
            >
                <option value="instructions">Instructions</option>
                <option value="settings">Ad Settings Form</option>
                <option value="performance">Ad Performance Data</option>
            </select>
            {activeView === 'instructions' && (
                <Instructions key="instructions" />
            )}
            {activeView === 'settings' && <AdSettingsForm key="settings" />}
            {activeView === 'performance' && (
                <AdPerformanceDataView key="performance" />
            )}
        </div>
    );
}

export default App;
