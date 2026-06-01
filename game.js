const MAX_LIVES = 3;
const BEST_SCORE_KEY = "reflexe-eclair-best-score";
const SETTINGS_KEY = "nils-calcul-settings";
const ADDITION_TYPES = [
  { id: "1-1", label: "1 + 1", scoreBonus: 0 },
  { id: "add-nine", label: "Addition de 9", scoreBonus: 70 },
  { id: "missing-1-1", label: "1 + 1 à trou", scoreBonus: 50 },
  { id: "mixed-no-carry", label: "1 + 2 ou 2 + 1 sans retenue", scoreBonus: 80 },
  { id: "missing-mixed-no-carry", label: "1 + 2 ou 2 + 1 à trou sans retenue", scoreBonus: 120 },
  { id: "mixed-carry", label: "1 + 2 ou 2 + 1 avec retenue", scoreBonus: 130 },
  { id: "missing-mixed-carry", label: "1 + 2 ou 2 + 1 à trou avec retenue", scoreBonus: 170 },
  { id: "2-2-no-carry", label: "2 + 2 sans retenue", scoreBonus: 170 },
  { id: "2-2-carry", label: "2 + 2 avec retenue", scoreBonus: 230 },
  { id: "repeated-addition", label: "Intro multiplication", scoreBonus: 210 },
];
const DEFAULT_SETTINGS = {
  additionType: "1-1",
  questions: 10,
  seconds: 8,
};

const elements = {
  score: document.querySelector("#score"),
  timer: document.querySelector("#timer"),
  lives: document.querySelector("#lives"),
  question: document.querySelector("#question"),
  answers: [...document.querySelectorAll(".answer")],
  bestScore: document.querySelector("#bestScore"),
  level: document.querySelector("#level"),
  totalQuestions: document.querySelector("#totalQuestions"),
  bonusBar: document.querySelector("#bonusBar"),
  feedback: document.querySelector("#feedback"),
  settingsButton: document.querySelector("#settingsButton"),
  soundButton: document.querySelector("#soundButton"),
  dialog: document.querySelector("#gameDialog"),
  dialogTitle: document.querySelector("#dialogTitle"),
  dialogText: document.querySelector("#dialogText"),
  correctionsPanel: document.querySelector("#correctionsPanel"),
  correctionsList: document.querySelector("#correctionsList"),
  restartButton: document.querySelector("#restartButton"),
  resultSettingsButton: document.querySelector("#resultSettingsButton"),
  stopButton: document.querySelector("#stopButton"),
  stopScreen: document.querySelector("#stopScreen"),
  settingsDialog: document.querySelector("#settingsDialog"),
  additionTypeSetting: document.querySelector("#additionTypeSetting"),
  additionTypeValue: document.querySelector("#additionTypeValue"),
  questionsSetting: document.querySelector("#questionsSetting"),
  questionsValue: document.querySelector("#questionsValue"),
  speedSetting: document.querySelector("#speedSetting"),
  speedValue: document.querySelector("#speedValue"),
  settingSteps: [...document.querySelectorAll(".setting-stepper button")],
  closeSettingsButton: document.querySelector("#closeSettingsButton"),
  applySettingsButton: document.querySelector("#applySettingsButton"),
};

const state = {
  score: 0,
  bestScore: Number(localStorage.getItem(BEST_SCORE_KEY) || 0),
  settings: loadSettings(),
  level: 1,
  lives: MAX_LIVES,
  correctAnswer: 0,
  currentQuestion: "",
  currentCorrection: "",
  answerMode: "sum",
  mistakes: [],
  roundLimit: 10,
  roundStartedAt: 0,
  pausedRemaining: null,
  locked: false,
  muted: false,
  ended: false,
  stopped: false,
  firstRunSettingsOpen: false,
  settingsOpenedFromResults: false,
  animationFrame: 0,
  audio: null,
};

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function clampNumber(value, min, max) {
  const number = Number(value);
  return Math.min(max, Math.max(min, Number.isFinite(number) ? number : min));
}

function getAdditionType(id) {
  return ADDITION_TYPES.find((type) => type.id === id) || ADDITION_TYPES[0];
}

function getAdditionTypeIndex(id) {
  return Math.max(0, ADDITION_TYPES.findIndex((type) => type.id === getAdditionType(id).id));
}

function inferAdditionType(saved) {
  if (ADDITION_TYPES.some((type) => type.id === saved.additionType)) {
    return saved.additionType;
  }

  if (Number(saved.digits) === 2) {
    return saved.carryMode === "carry" ? "2-2-carry" : "2-2-no-carry";
  }

  return DEFAULT_SETTINGS.additionType;
}

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");

    return {
      additionType: inferAdditionType(saved),
      questions: clampNumber(saved.questions ?? DEFAULT_SETTINGS.questions, 5, 30),
      seconds: clampNumber(saved.seconds ?? DEFAULT_SETTINGS.seconds, 4, 120),
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
}

function shuffle(values) {
  return values
    .map((value) => ({ value, order: Math.random() }))
    .sort((a, b) => a.order - b.order)
    .map(({ value }) => value);
}

function formatSeconds(value) {
  const seconds = Math.max(0, Math.ceil(value));
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

function updateHud() {
  elements.score.textContent = state.score;
  elements.lives.textContent = state.lives;
  elements.level.textContent = state.level;
  elements.totalQuestions.textContent = state.settings.questions;
  elements.bestScore.textContent = state.bestScore;
}

function syncSettingControls(settings = state.settings) {
  const additionType = getAdditionType(settings.additionType);

  elements.additionTypeSetting.max = ADDITION_TYPES.length - 1;
  elements.additionTypeSetting.value = getAdditionTypeIndex(additionType.id);
  elements.additionTypeValue.textContent = additionType.label;
  elements.questionsSetting.value = settings.questions;
  elements.speedSetting.value = settings.seconds;
  elements.questionsValue.textContent = settings.questions;
  elements.speedValue.textContent = `${settings.seconds} s`;
}

function readSettingControls() {
  const additionTypeIndex = Math.round(clampNumber(elements.additionTypeSetting.value, 0, ADDITION_TYPES.length - 1));

  return {
    additionType: ADDITION_TYPES[additionTypeIndex].id,
    questions: clampNumber(elements.questionsSetting.value, 5, 30),
    seconds: clampNumber(elements.speedSetting.value, 4, 120),
  };
}

function changeSetting(setting, direction) {
  const inputBySetting = {
    additionType: elements.additionTypeSetting,
    questions: elements.questionsSetting,
    seconds: elements.speedSetting,
  };
  const input = inputBySetting[setting];

  if (!input) {
    return;
  }

  const min = Number(input.min);
  const max = Number(input.max);
  const step = Number(input.step) || 1;
  const nextValue = clampNumber(Number(input.value) + direction * step, min, max);

  input.value = nextValue;
  syncSettingControls(readSettingControls());
}

function saveBestScore() {
  if (state.score <= state.bestScore) {
    return;
  }

  state.bestScore = state.score;
  localStorage.setItem(BEST_SCORE_KEY, String(state.bestScore));
  elements.bestScore.textContent = state.bestScore;
}

function maybeSwapAddends(first, second) {
  return Math.random() < 0.5 ? [first, second] : [second, first];
}

function buildOneDigitAddendsAboveTen() {
  const first = randomInt(2, 9);
  const second = randomInt(11 - first, 9);

  return maybeSwapAddends(first, second);
}

function buildNineAddends() {
  const other = Math.random() < 0.5 ? randomInt(1, 9) : randomInt(10, 99);

  return maybeSwapAddends(9, other);
}

function buildMixedAddends(hasCarry) {
  const oneDigit = hasCarry ? randomInt(2, 9) : randomInt(1, 9);
  const unit = hasCarry ? randomInt(11 - oneDigit, 9) : randomInt(0, Math.min(9, 10 - oneDigit));
  const twoDigit = randomInt(1, 9) * 10 + unit;

  return maybeSwapAddends(oneDigit, twoDigit);
}

function buildTwoDigitAddends(hasCarry) {
  const tenA = randomInt(1, 9) * 10;
  const tenB = randomInt(1, 9) * 10;

  if (hasCarry) {
    const unitA = randomInt(2, 9);
    const unitB = randomInt(11 - unitA, 9);
    return [tenA + unitA, tenB + unitB];
  }

  const unitA = randomInt(0, 9);
  const unitB = randomInt(0, Math.min(9, 10 - unitA));
  return [tenA + unitA, tenB + unitB];
}

function buildRepeatedAddends() {
  const value = randomInt(1, 10);
  const maxTerms = value <= 3 ? 5 : value <= 6 ? 4 : 3;
  const termCount = randomInt(3, maxTerms);

  return Array(termCount).fill(value);
}

function setSumQuestion(first, second) {
  state.answerMode = "sum";
  state.correctAnswer = first + second;
  state.currentQuestion = `${first} + ${second}`;
  state.currentCorrection = `${state.currentQuestion} = ${state.correctAnswer}`;
}

function setRepeatedQuestion(addends) {
  state.answerMode = "sum";
  state.correctAnswer = addends.reduce((total, value) => total + value, 0);
  state.currentQuestion = addends.join(" + ");
  state.currentCorrection = `${state.currentQuestion} = ${state.correctAnswer}`;
}

function setMissingAddendQuestion(first, second) {
  const hideFirst = first < 10 && (second >= 10 || Math.random() < 0.5);
  const missing = hideFirst ? first : second;
  const visible = hideFirst ? second : first;
  const total = first + second;

  state.answerMode = "digit";
  state.correctAnswer = missing;
  state.currentQuestion = hideFirst ? `_ + ${visible} = ${total}` : `${visible} + _ = ${total}`;
  state.currentCorrection = `${first} + ${second} = ${total}`;
}

function buildQuestion() {
  let first;
  let second;
  let customQuestion = false;
  const additionType = getAdditionType(state.settings.additionType).id;

  if (additionType === "missing-1-1") {
    [first, second] = buildOneDigitAddendsAboveTen();
    setMissingAddendQuestion(first, second);
    customQuestion = true;
  } else if (additionType === "add-nine") {
    [first, second] = buildNineAddends();
  } else if (additionType === "mixed-no-carry") {
    [first, second] = buildMixedAddends(false);
  } else if (additionType === "mixed-carry") {
    [first, second] = buildMixedAddends(true);
  } else if (additionType === "missing-mixed-no-carry") {
    [first, second] = buildMixedAddends(false);
    setMissingAddendQuestion(first, second);
    customQuestion = true;
  } else if (additionType === "missing-mixed-carry") {
    [first, second] = buildMixedAddends(true);
    setMissingAddendQuestion(first, second);
    customQuestion = true;
  } else if (additionType === "2-2-no-carry") {
    [first, second] = buildTwoDigitAddends(false);
  } else if (additionType === "2-2-carry") {
    [first, second] = buildTwoDigitAddends(true);
  } else if (additionType === "repeated-addition") {
    setRepeatedQuestion(buildRepeatedAddends());
    customQuestion = true;
  } else {
    [first, second] = buildOneDigitAddendsAboveTen();
  }

  if (!customQuestion) {
    setSumQuestion(first, second);
  }

  elements.question.textContent = state.currentQuestion;
  elements.question.classList.toggle("is-hole-question", state.answerMode === "digit");
  elements.question.classList.toggle("is-repeated-question", additionType === "repeated-addition");
}

function addSameUnitDistractor(answers) {
  if (state.correctAnswer < 10) {
    return;
  }

  const tensOffsets = [10, -10, 20, -20, 30, -30, 40, -40, 50, -50, 60, -60, 70, -70, 80, -80, 90, -90];

  for (const offset of tensOffsets) {
    const candidate = state.correctAnswer + offset;

    if (candidate > 0 && !answers.has(candidate) && candidate % 10 === state.correctAnswer % 10) {
      answers.add(candidate);
      return;
    }
  }
}

function buildAnswers() {
  const answers = new Set([state.correctAnswer]);

  if (state.answerMode === "digit") {
    while (answers.size < 4) {
      answers.add(randomInt(1, 9));
    }

    shuffle([...answers]).forEach((answer, index) => {
      const button = elements.answers[index];
      button.textContent = answer;
      button.dataset.answer = String(answer);
      button.classList.remove("is-correct", "is-wrong", "is-pressed");
      button.disabled = false;
    });
    return;
  }

  const place = state.correctAnswer > 30 ? 10 : 1;
  const spread = Math.max(5, place * 6);

  addSameUnitDistractor(answers);

  while (answers.size < 4) {
    const offset = randomInt(-spread, spread);
    const candidate = state.correctAnswer + offset;

    if (offset !== 0 && candidate >= 1) {
      answers.add(candidate);
    }
  }

  shuffle([...answers]).forEach((answer, index) => {
    const button = elements.answers[index];
    button.textContent = answer;
    button.dataset.answer = String(answer);
    button.classList.remove("is-correct", "is-wrong", "is-pressed");
    button.disabled = false;
  });
}

function secondsForLevel() {
  return state.settings.seconds;
}

function startRound() {
  state.locked = false;
  state.ended = false;
  state.pausedRemaining = null;
  state.roundLimit = secondsForLevel();
  state.roundStartedAt = performance.now();

  buildQuestion();
  buildAnswers();
  updateHud();
  tick();
}

function tick(now = performance.now()) {
  cancelAnimationFrame(state.animationFrame);

  if (state.locked || state.ended) {
    return;
  }

  const elapsed = (now - state.roundStartedAt) / 1000;
  const remaining = state.roundLimit - elapsed;
  const ratio = Math.max(0, remaining / state.roundLimit);

  elements.timer.textContent = formatSeconds(remaining);
  elements.bonusBar.style.width = `${Math.round(ratio * 100)}%`;

  if (remaining <= 0) {
    loseLife("Trop tard !");
    return;
  }

  state.animationFrame = requestAnimationFrame(tick);
}

function showFeedback(text, type) {
  elements.feedback.textContent = text;
  elements.feedback.className = `feedback ${type} show`;

  window.setTimeout(() => {
    elements.feedback.classList.remove("show");
  }, 760);
}

function currentBonusScore() {
  const elapsed = (performance.now() - state.roundStartedAt) / 1000;
  const remaining = Math.max(0, state.roundLimit - elapsed);
  const speedRatio = remaining / state.roundLimit;
  const additionType = getAdditionType(state.settings.additionType);

  return Math.round(100 + speedRatio * 220 + state.level * 20 + additionType.scoreBonus);
}

function recordMistake(selectedAnswer) {
  state.mistakes.push({
    question: state.currentQuestion,
    correction: state.currentCorrection,
    selectedAnswer,
    correctAnswer: state.correctAnswer,
  });
}

function renderCorrections() {
  elements.correctionsList.textContent = "";
  elements.correctionsPanel.hidden = false;

  if (state.mistakes.length === 0) {
    const item = document.createElement("div");
    item.className = "correction-item";
    item.innerHTML = `
      <div class="correction-sum">Tout est juste !</div>
      <div class="correction-answer">Bravo</div>
      <div class="correction-note">Aucune erreur à corriger.</div>
    `;
    elements.correctionsList.append(item);
    return;
  }

  state.mistakes.forEach((mistake) => {
    const item = document.createElement("div");
    const note =
      mistake.selectedAnswer === null
        ? "Nils n'a pas répondu à temps."
        : `Nils a répondu ${mistake.selectedAnswer}.`;

    const correction = mistake.correction || `${mistake.question} = ${mistake.correctAnswer}`;

    item.className = "correction-item";
    item.innerHTML = `
      <div class="correction-sum">${correction}</div>
      <div class="correction-answer">Bonne réponse : ${mistake.correctAnswer}</div>
      <div class="correction-note">${note}</div>
    `;
    elements.correctionsList.append(item);
  });
}

function handleCorrect(button) {
  state.locked = true;
  cancelAnimationFrame(state.animationFrame);

  const points = currentBonusScore();
  state.score += points;
  saveBestScore();
  updateHud();

  button.classList.add("is-correct");
  showFeedback(`+${points}`, "good");
  playSound("correct");

  if (state.level >= state.settings.questions) {
    window.setTimeout(() => endGame(state.mistakes.length === 0), 760);
    return;
  }

  state.level += 1;
  window.setTimeout(startRound, 760);
}

function loseLife(message, selectedButton = null) {
  if (state.locked || state.ended) {
    return;
  }

  state.locked = true;
  cancelAnimationFrame(state.animationFrame);
  recordMistake(selectedButton ? Number(selectedButton.dataset.answer) : null);
  state.lives = Math.max(0, state.lives - 1);
  updateHud();

  if (selectedButton) {
    selectedButton.classList.add("is-wrong");
  }

  elements.answers.forEach((button) => {
    if (Number(button.dataset.answer) === state.correctAnswer) {
      button.classList.add("is-correct");
    }
    button.disabled = true;
  });

  showFeedback(message, "bad");
  playSound("wrong");

  if (state.level >= state.settings.questions) {
    window.setTimeout(() => endGame(false), 900);
    return;
  }

  state.level += 1;
  window.setTimeout(startRound, 900);
}

function answer(button) {
  ensureAudio();

  if (state.locked || state.ended) {
    return;
  }

  button.classList.add("is-pressed");
  window.setTimeout(() => button.classList.remove("is-pressed"), 150);

  const value = Number(button.dataset.answer);

  if (value === state.correctAnswer) {
    handleCorrect(button);
    return;
  }

  loseLife("Oups !", button);
}

function endGame(won) {
  state.ended = true;
  state.locked = true;
  cancelAnimationFrame(state.animationFrame);
  saveBestScore();

  elements.answers.forEach((button) => {
    button.disabled = true;
  });

  if (won) {
    elements.dialogTitle.textContent = "Bravo !";
    elements.dialogText.textContent = `Tu as répondu aux ${state.settings.questions} questions avec ${state.score} points.`;
    playSound("win");
  } else {
    elements.dialogTitle.textContent = "Encore !";
    elements.dialogText.textContent = `Tu as répondu aux ${state.settings.questions} questions. Ton score est ${state.score}.`;
  }

  renderCorrections();

  if (!elements.dialog.open) {
    elements.dialog.showModal();
  }
}

function restartGame() {
  state.score = 0;
  state.level = 1;
  state.lives = MAX_LIVES;
  state.currentQuestion = "";
  state.currentCorrection = "";
  state.answerMode = "sum";
  state.mistakes = [];
  state.pausedRemaining = null;
  state.locked = false;
  state.ended = false;
  state.stopped = false;
  state.settingsOpenedFromResults = false;
  elements.stopScreen.hidden = true;

  if (elements.dialog.open) {
    elements.dialog.close();
  }

  startRound();
}

function stopGame() {
  state.stopped = true;
  state.locked = true;
  state.ended = true;
  cancelAnimationFrame(state.animationFrame);

  elements.answers.forEach((button) => {
    button.disabled = true;
  });

  if (elements.dialog.open) {
    elements.dialog.close();
  }

  if (elements.settingsDialog.open) {
    elements.settingsDialog.close();
  }

  elements.stopScreen.hidden = false;

  window.setTimeout(() => {
    window.close();
  }, 80);
}

function openSettings(options = {}) {
  state.firstRunSettingsOpen = Boolean(options.firstRun);
  state.settingsOpenedFromResults = Boolean(options.fromResults);
  elements.closeSettingsButton.textContent = state.firstRunSettingsOpen ? "Jouer" : "Fermer";
  syncSettingControls();

  if (!state.ended && !state.locked) {
    const elapsed = (performance.now() - state.roundStartedAt) / 1000;
    state.pausedRemaining = Math.max(1, state.roundLimit - elapsed);
    state.locked = true;
    cancelAnimationFrame(state.animationFrame);
  }

  if (!elements.settingsDialog.open) {
    elements.settingsDialog.showModal();
  }
}

function closeSettings({ resume } = { resume: true }) {
  if (elements.settingsDialog.open) {
    elements.settingsDialog.close();
  }

  if (state.firstRunSettingsOpen) {
    state.firstRunSettingsOpen = false;
  }

  if (!resume || state.pausedRemaining === null || state.ended) {
    state.pausedRemaining = null;
    if (state.settingsOpenedFromResults && state.ended && !elements.dialog.open) {
      elements.dialog.showModal();
    }
    state.settingsOpenedFromResults = false;
    return;
  }

  state.roundLimit = state.pausedRemaining;
  state.roundStartedAt = performance.now();
  state.pausedRemaining = null;
  state.settingsOpenedFromResults = false;
  state.locked = false;
  tick();
}

function applySettings() {
  state.settings = readSettingControls();
  saveSettings();
  state.firstRunSettingsOpen = false;
  state.settingsOpenedFromResults = false;
  closeSettings({ resume: false });
  restartGame();
}

function ensureAudio() {
  if (state.audio || state.muted) {
    return;
  }

  const AudioContext = window.AudioContext || window.webkitAudioContext;

  if (!AudioContext) {
    state.muted = true;
    elements.soundButton.classList.add("is-muted");
    return;
  }

  state.audio = new AudioContext();
}

function playTone(frequency, startTime, duration, gainValue) {
  if (!state.audio || state.muted) {
    return;
  }

  const oscillator = state.audio.createOscillator();
  const gain = state.audio.createGain();

  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(frequency, startTime);
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(gainValue, startTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
  oscillator.connect(gain).connect(state.audio.destination);
  oscillator.start(startTime);
  oscillator.stop(startTime + duration + 0.03);
}

function playSound(type) {
  if (!state.audio || state.muted) {
    return;
  }

  const now = state.audio.currentTime;

  if (type === "correct") {
    playTone(523, now, 0.12, 0.16);
    playTone(784, now + 0.1, 0.16, 0.16);
  }

  if (type === "wrong") {
    playTone(180, now, 0.14, 0.14);
    playTone(130, now + 0.12, 0.18, 0.12);
  }

  if (type === "win") {
    [523, 659, 784, 1046].forEach((frequency, index) => {
      playTone(frequency, now + index * 0.09, 0.16, 0.15);
    });
  }
}

elements.answers.forEach((button) => {
  button.addEventListener("click", () => answer(button));
});

elements.settingsButton.addEventListener("click", () => openSettings());

elements.soundButton.addEventListener("click", () => {
  state.muted = !state.muted;
  elements.soundButton.classList.toggle("is-muted", state.muted);
  elements.soundButton.setAttribute("aria-label", state.muted ? "Son coupé" : "Son activé");

  if (!state.muted) {
    ensureAudio();
    playSound("correct");
  }
});

elements.restartButton.addEventListener("click", () => {
  ensureAudio();
  restartGame();
});

elements.resultSettingsButton.addEventListener("click", () => {
  if (elements.dialog.open) {
    elements.dialog.close();
  }

  openSettings({ fromResults: true });
});

elements.stopButton.addEventListener("click", stopGame);

[elements.additionTypeSetting, elements.questionsSetting, elements.speedSetting].forEach((input) => {
  input.addEventListener("input", () => syncSettingControls(readSettingControls()));
});

elements.settingSteps.forEach((button) => {
  button.addEventListener("click", () => {
    changeSetting(button.dataset.setting, Number(button.dataset.delta));
  });
});

elements.closeSettingsButton.addEventListener("click", () => closeSettings({ resume: true }));
elements.applySettingsButton.addEventListener("click", applySettings);

elements.settingsDialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  closeSettings({ resume: true });
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && elements.dialog.open) {
    restartGame();
    return;
  }

  const button = elements.answers.find((candidate) => candidate.textContent === event.key);

  if (button) {
    answer(button);
  }
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden || state.ended || state.locked) {
    return;
  }

  state.roundStartedAt = performance.now();
});

syncSettingControls();
updateHud();
startRound();
window.setTimeout(() => openSettings({ firstRun: true }), 0);
