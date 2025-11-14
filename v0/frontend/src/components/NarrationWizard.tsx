import { useState, useEffect, useRef } from 'react';
import { apiClient } from '../api/client';
import { resolveMediaUrl } from '../api/client';
import type { TripResponse, Photo, DayItinerary } from '../types';
import './NarrationWizard.css';

interface NarrationWizardProps {
  tripId: string;
  tripData: TripResponse;
  onClose: () => void;
  onComplete: () => void;
}

interface NarrationQuestion {
  id: string;
  photoId: string;
  dayNumber: number;
  question: string;
  type: string;
}

interface PhotoContext {
  photo: Photo;
  description: any;
  location: {
    city?: string;
    country?: string;
    landmark?: string;
  };
  summary: string;
}

export function NarrationWizard({ tripId, tripData, onClose, onComplete }: NarrationWizardProps) {
  const [currentStep, setCurrentStep] = useState<'starting' | 'questions' | 'completing' | 'completed'>('starting');
  const [currentDayIndex, setCurrentDayIndex] = useState(0);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [photoContext, setPhotoContext] = useState<PhotoContext | null>(null);
  const [questions, setQuestions] = useState<NarrationQuestion[]>([]);
  const [answers, setAnswers] = useState<Map<string, string>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [photosByDay, setPhotosByDay] = useState<Map<number, Photo[]>>(new Map());
  const [totalPhotos, setTotalPhotos] = useState(0);
  const [processedPhotos, setProcessedPhotos] = useState(0);
  const isLoadingPhotoRef = useRef(false);

  const days: DayItinerary[] = tripData.days;

  // Initialize: start narration and load all photos
  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      try {
        setError(null);
        // Start narration
        await apiClient.startNarration(tripId);
        
        if (cancelled) return;
        
        // Load all photos for all days
        const photosMap = new Map<number, Photo[]>();
        let total = 0;
        for (const day of days) {
          try {
            const dayData = await apiClient.fetchDay(tripId, day.dayNumber);
            photosMap.set(day.dayNumber, dayData.photos);
            total += dayData.photos.length;
          } catch (err) {
            console.error(`Failed to load photos for day ${day.dayNumber}:`, err);
            photosMap.set(day.dayNumber, []);
          }
        }
        
        if (cancelled) return;
        
        setPhotosByDay(photosMap);
        setTotalPhotos(total);
        setCurrentStep('questions');
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to start narration');
        }
      }
    }

    initialize();
    
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId]);

  // Load first photo once photos are loaded
  useEffect(() => {
    if (currentStep === 'questions' && photosByDay.size > 0 && !photoContext && !isLoadingPhotoRef.current) {
      isLoadingPhotoRef.current = true;
      loadNextPhoto();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photosByDay, currentStep]);

  const loadNextPhoto = async (dayIdx?: number, photoIdx?: number) => {
    if (isLoadingPhotoRef.current && photoContext) {
      // Already loading or has photo, skip
      return;
    }

    isLoadingPhotoRef.current = true;

    // Use provided indices or current state
    const startDayIdx = dayIdx !== undefined ? dayIdx : currentDayIndex;
    const startPhotoIdx = photoIdx !== undefined ? photoIdx : currentPhotoIndex;

    // Find next photo to process
    let foundPhoto: Photo | null = null;
    let foundDayIndex = startDayIdx;
    let foundPhotoIndex = startPhotoIdx;
    
    // Start from provided/current position
    for (let dIdx = startDayIdx; dIdx < days.length; dIdx++) {
      const day = days[dIdx];
      const dayPhotos = photosByDay.get(day.dayNumber) || [];
      
      // Start from provided photo index if same day, otherwise 0
      const startIdx = dIdx === startDayIdx ? startPhotoIdx : 0;
      
      for (let pIdx = startIdx; pIdx < dayPhotos.length; pIdx++) {
        foundPhoto = dayPhotos[pIdx];
        foundDayIndex = dIdx;
        foundPhotoIndex = pIdx;
        break;
      }
      
      if (foundPhoto) break;
    }

    // If no more photos, complete narration
    if (!foundPhoto) {
      isLoadingPhotoRef.current = false;
      await completeNarration();
      return;
    }

    // Update indices
    setCurrentDayIndex(foundDayIndex);
    setCurrentPhotoIndex(foundPhotoIndex);
    
    try {
      // Get photo context
      const contextData = await apiClient.getPhotoContext(tripId, foundPhoto.id);
      setPhotoContext(contextData.context);

      // Get questions for this photo
      const questionsData = await apiClient.getPhotoQuestions(tripId, foundPhoto.id);
      // Ensure questions is an array
      const questionsArray = Array.isArray(questionsData?.questions) 
        ? questionsData.questions 
        : [];
      
      // If no questions, skip to next photo
      if (questionsArray.length === 0) {
        isLoadingPhotoRef.current = false;
        // Move to next photo
        const nextPhotoIndex = foundPhotoIndex + 1;
        setCurrentPhotoIndex(nextPhotoIndex);
        await loadNextPhoto(foundDayIndex, nextPhotoIndex);
        return;
      }
      
      setQuestions(questionsArray);
      setCurrentQuestionIndex(0);
      setAnswers(new Map()); // Clear answers for new photo
      isLoadingPhotoRef.current = false;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load photo');
      isLoadingPhotoRef.current = false;
    }
  };

  const handleAnswer = (questionId: string, answer: string) => {
    setAnswers(new Map(answers.set(questionId, answer)));
  };

  const handleNextQuestion = async () => {
    if (!Array.isArray(questions) || questions.length === 0) {
      // No questions, move to next photo
      setPhotoContext(null);
      const nextPhotoIndex = currentPhotoIndex + 1;
      setCurrentPhotoIndex(nextPhotoIndex);
      await loadNextPhoto(currentDayIndex, nextPhotoIndex);
      return;
    }

    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
      return;
    }

    // All questions answered for this photo, submit answers
    await submitAnswersForCurrentPhoto();
  };

  const submitAnswersForCurrentPhoto = async () => {
    if (!photoContext) {
      // No photo context, move to next photo
      setPhotoContext(null);
      const nextPhotoIndex = currentPhotoIndex + 1;
      setCurrentPhotoIndex(nextPhotoIndex);
      await loadNextPhoto(currentDayIndex, nextPhotoIndex);
      return;
    }

    try {
      // Submit all answers for current photo
      if (questions.length > 0) {
        for (const question of questions) {
          const answer = answers.get(question.id);
          if (answer && answer.trim()) {
            await apiClient.submitNarrationAnswer(tripId, {
              questionId: question.id,
              questionText: question.question,
              photoId: photoContext.photo.id,
              dayNumber: question.dayNumber,
              answer: answer.trim(),
            });
          }
        }
      }

      setProcessedPhotos(prev => prev + 1);
      // Clear current photo context and move to next photo
      setPhotoContext(null);
      const nextPhotoIndex = currentPhotoIndex + 1;
      setCurrentPhotoIndex(nextPhotoIndex);
      await loadNextPhoto(currentDayIndex, nextPhotoIndex);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit answers');
      isLoadingPhotoRef.current = false;
    }
  };

  const completeNarration = async () => {
    try {
      setCurrentStep('completing');
      await apiClient.completeNarration(tripId);
      setCurrentStep('completed');
      // Wait a moment then call onComplete
      setTimeout(() => {
        onComplete();
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to complete narration');
    }
  };

  if (currentStep === 'starting') {
    return (
      <div className="narration-wizard">
        <div className="loading-content">
          <div className="loading-spinner-large"></div>
          <h2>Starting Trip Itinerary Narration</h2>
          <p>Preparing your trip for enhancement...</p>
          {error && <div className="error-message">{error}</div>}
        </div>
      </div>
    );
  }

  if (currentStep === 'completing') {
    return (
      <div className="narration-wizard">
        <div className="loading-content">
          <div className="loading-spinner-large"></div>
          <h2>Processing Your Answers</h2>
          <p>We're creating your personalized itinerary based on your responses...</p>
          <p className="loading-subtext">This may take a few moments</p>
          {error && <div className="error-message">{error}</div>}
        </div>
      </div>
    );
  }

  if (currentStep === 'completed') {
    return (
      <div className="narration-wizard">
        <div className="loading-content">
          <div className="success-icon">✨</div>
          <h2>Narration Complete!</h2>
          <p>Your personalized itinerary has been created successfully.</p>
          <button onClick={onComplete} className="wizard-button wizard-button-primary">
            View Enhanced Trip
          </button>
        </div>
      </div>
    );
  }

  // Define currentDay early so it can be used in checks
  const currentDay = days[currentDayIndex];

  if (!photoContext || !currentDay || questions.length === 0) {
    return (
      <div className="narration-wizard">
        <div className="loading-content">
          <div className="loading-spinner-large"></div>
          <h2>Loading Photo</h2>
          <p>Preparing questions for this photo...</p>
          {error && <div className="error-message">{error}</div>}
          {questions.length === 0 && !error && photoContext && (
            <p className="loading-subtext">No questions available for this photo. Moving to next...</p>
          )}
        </div>
      </div>
    );
  }
  const currentQuestion = questions[currentQuestionIndex];
  if (!currentQuestion) {
    return (
      <div className="narration-wizard">
        <div className="loading-content">
          <div className="loading-spinner-large"></div>
          <h2>Preparing Question</h2>
          <p>Loading question {currentQuestionIndex + 1} of {questions.length}...</p>
        </div>
      </div>
    );
  }

  const currentAnswer = answers.get(currentQuestion.id) || '';
  const photoUrl = resolveMediaUrl(photoContext.photo.fileUrl);
  // Calculate progress based on processed photos
  const progress = totalPhotos > 0 ? Math.round((processedPhotos / totalPhotos) * 100) : 0;

  return (
    <div className="narration-wizard">
        <div className="wizard-header">
          <h2>Enhance Your Trip with Narration</h2>
          <button onClick={onClose} className="wizard-close-button" title="Close wizard">
            ✕
          </button>
        </div>

        <div className="wizard-progress">
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${progress}%` }}></div>
          </div>
          <p className="progress-text">
            Day {currentDay.dayNumber} • Photo {currentPhotoIndex + 1} • Question {currentQuestionIndex + 1} of {questions.length}
          </p>
        </div>

        {error && <div className="error-message">{error}</div>}

        <div className="wizard-content">
          <div className="wizard-photo-section">
            {photoUrl && (
              <img src={photoUrl} alt={photoContext.photo.filename} className="wizard-photo" />
            )}
            <div className="photo-context">
              <h3>About this photo</h3>
              <p>{photoContext.summary}</p>
              {photoContext.location.city && (
                <p className="photo-location">
                  📍 {photoContext.location.city}
                  {photoContext.location.country && `, ${photoContext.location.country}`}
                </p>
              )}
            </div>
          </div>

          <div className="wizard-question-section">
            <h3>Question {currentQuestionIndex + 1} of {questions.length}</h3>
            <p className="question-text">{currentQuestion.question}</p>
            
            <div className="answer-input">
              <textarea
                value={currentAnswer}
                onChange={(e) => handleAnswer(currentQuestion.id, e.target.value)}
                placeholder="Type your answer here..."
                rows={4}
                className="answer-textarea"
              />
            </div>

            <div className="wizard-actions">
              {currentQuestionIndex > 0 && (
                <button
                  onClick={() => setCurrentQuestionIndex(currentQuestionIndex - 1)}
                  className="wizard-button wizard-button-secondary"
                >
                  ← Previous
                </button>
              )}
              <div style={{ flex: 1 }} />
              {currentQuestionIndex < questions.length - 1 ? (
                <button
                  onClick={handleNextQuestion}
                  disabled={!currentAnswer.trim()}
                  className="wizard-button wizard-button-primary"
                >
                  Next →
                </button>
              ) : (
                <button
                  onClick={handleNextQuestion}
                  disabled={!currentAnswer.trim()}
                  className="wizard-button wizard-button-primary"
                >
                  {currentDayIndex < days.length - 1 || currentPhotoIndex < (photosByDay.get(currentDay.dayNumber)?.length || 0) - 1
                    ? 'Next Photo →'
                    : 'Complete →'}
                </button>
              )}
            </div>
          </div>
        </div>
    </div>
  );
}

