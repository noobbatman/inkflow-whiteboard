import React, { useState } from 'react';
import './LoginPage.css';

function LoginPage({ onLogin }) {
  const [sessionName, setSessionName] = useState('');
  const [userName, setUserName] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState('');

  const handleAction = async (e) => {
    e.preventDefault();
    setError('');

    if (!sessionName || !userName) {
      setError('Session name and user name are required.');
      return;
    }

    const baseUrl = process.env.REACT_APP_API_URL || '';
    const url = isJoining ? `${baseUrl}/api/sessions/join` : `${baseUrl}/api/sessions/create`;
    const body = isJoining
      ? { sessionName, userName }
      : { sessionName, managerName: userName };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        // const sessionData = await response.json(); // You can use this data if needed
        onLogin({ sessionName, userName });
      } else {
        const errorText = await response.text();
        try {
          const errorJson = JSON.parse(errorText);
          setError(errorJson.message || `Failed to ${isJoining ? 'join' : 'create'} session.`);
        } catch {
          setError(errorText || `Failed to ${isJoining ? 'join' : 'create'} session.`);
        }
      }
    } catch (err) {
      setError('An error occurred. Is the backend server running?');
    }
  };

  return (
    <div className="login-container">
      <div className="login-form">
        <h2>{isJoining ? 'Join Session' : 'Create Session'}</h2>
        <form onSubmit={handleAction}>
          <div className="form-group">
            <label htmlFor="session-name">Session Name</label>
            <input
              id="session-name"
              type="text"
              value={sessionName}
              onChange={(e) => setSessionName(e.target.value)}
              placeholder="e.g., 'project-alpha'"
            />
          </div>
          <div className="form-group">
            <label htmlFor="user-name">Your Name</label>
            <input
              id="user-name"
              type="text"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              placeholder="e.g., 'Tansim'"
            />
          </div>
          {error && <p className="error-message">{error}</p>}
          <button type="submit" className="btn-primary">
            {isJoining ? 'Join' : 'Create'}
          </button>
        </form>
        <button
          onClick={() => {
            setIsJoining(!isJoining);
            setError('');
          }}
          className="btn-secondary"
        >
          {isJoining
            ? 'Need to create a session?'
            : 'Already have a session?'}
        </button>
      </div>
    </div>
  );
}

export default LoginPage;