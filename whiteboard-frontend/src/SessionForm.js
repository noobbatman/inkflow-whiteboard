import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import './SessionForm.css';

function SessionForm({ onLogin }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const mode = searchParams.get('mode') || 'create'; // 'create' or 'join'

  const [sessionName, setSessionName] = useState('');
  const [userName, setUserName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!sessionName.trim() || !userName.trim()) {
      setError('Please fill in all fields');
      return;
    }

    setLoading(true);

    const baseUrl = process.env.REACT_APP_API_URL || '';
    const url = mode === 'join' ? `${baseUrl}/api/sessions/join` : `${baseUrl}/api/sessions/create`;
    const body = mode === 'join'
      ? { sessionName: sessionName.trim(), userName: userName.trim() }
      : { sessionName: sessionName.trim(), managerName: userName.trim() };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        onLogin({ sessionName: sessionName.trim(), userName: userName.trim() });
      } else {
        const errorText = await response.text();
        try {
          const errorJson = JSON.parse(errorText);
          setError(errorJson.message || `Failed to ${mode} session. Please try again.`);
        } catch {
          setError(errorText || `Failed to ${mode} session. Please try again.`);
        }
      }
    } catch (err) {
      console.error('Error:', err);
      setError('Connection error. Please ensure the backend server is running.');
    } finally {
      setLoading(false);
    }
  };

  const containerVariants = {
    hidden: { opacity: 0, scale: 0.9 },
    visible: {
      opacity: 1,
      scale: 1,
      transition: {
        duration: 0.5,
        type: 'spring',
        stiffness: 100
      }
    }
  };

  return (
    <div className="session-form-container">
      {/* Animated Background */}
      <div className="session-bg">
        <div className="session-orb session-orb-1"></div>
        <div className="session-orb session-orb-2"></div>
      </div>

      <motion.div
        className="session-form-content"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {/* Back Button */}
        <motion.button
          className="back-button"
          onClick={() => navigate('/')}
          whileHover={{ scale: 1.1, x: -5 }}
          whileTap={{ scale: 0.9 }}
        >
          <span className="back-arrow">←</span>
          <span className="back-text">Back</span>
        </motion.button>

        {/* Form Card */}
        <motion.div className="form-card">
          <div className="form-header">
            <motion.div
              className="form-icon"
              initial={{ rotate: 0 }}
              animate={{ rotate: 360 }}
              transition={{ duration: 1, delay: 0.2 }}
            >
              {mode === 'create' ? '✨' : '🚀'}
            </motion.div>
            <h2 className="form-title">
              {mode === 'create' ? 'Create New Session' : 'Join Session'}
            </h2>
            <p className="form-subtitle">
              {mode === 'create'
                ? 'Start a new collaborative whiteboard session'
                : 'Enter session details to join your team'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="session-form">
            <div className="input-group">
              <label htmlFor="sessionName" className="input-label">
                <span className="label-icon">🏷️</span>
                Session Name
              </label>
              <motion.input
                id="sessionName"
                type="text"
                value={sessionName}
                onChange={(e) => setSessionName(e.target.value)}
                placeholder="e.g., Design Sprint 2025"
                className="form-input"
                whileFocus={{ scale: 1.02 }}
                disabled={loading}
              />
            </div>

            <div className="input-group">
              <label htmlFor="userName" className="input-label">
                <span className="label-icon">👤</span>
                Your Name
              </label>
              <motion.input
                id="userName"
                type="text"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                placeholder="e.g., Alex Johnson"
                className="form-input"
                whileFocus={{ scale: 1.02 }}
                disabled={loading}
              />
            </div>

            {error && (
              <motion.div
                className="error-message"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <span className="error-icon">⚠️</span>
                {error}
              </motion.div>
            )}

            <motion.button
              type="submit"
              className={`submit-button ${mode === 'create' ? 'create-mode' : 'join-mode'}`}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              disabled={loading}
            >
              {loading ? (
                <>
                  <span className="loading-spinner"></span>
                  <span>{mode === 'create' ? 'Creating...' : 'Joining...'}</span>
                </>
              ) : (
                <>
                  <span>{mode === 'create' ? 'Create Session' : 'Join Session'}</span>
                  <span className="submit-arrow">→</span>
                </>
              )}
              <div className="button-glow"></div>
            </motion.button>
          </form>

          <div className="form-footer">
            <p className="switch-mode-text">
              {mode === 'create' ? 'Already have a session?' : 'Want to create a new session?'}
            </p>
            <motion.button
              type="button"
              className="switch-mode-button"
              onClick={() => navigate(`/session-form?mode=${mode === 'create' ? 'join' : 'create'}`)}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              {mode === 'create' ? 'Join existing session' : 'Create new session'}
            </motion.button>
          </div>
        </motion.div>

        {/* Decorative Elements */}
        <div className="floating-shapes">
          {[...Array(8)].map((_, i) => (
            <div
              key={i}
              className="floating-shape"
              style={{
                left: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 3}s`,
                animationDuration: `${3 + Math.random() * 4}s`
              }}
            ></div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

export default SessionForm;
