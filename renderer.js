// DOM 요소 - 공통
const currentDateEl = document.getElementById('currentDate');
const currentTimeEl = document.getElementById('currentTime');
const tabBtns = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

// DOM 요소 - 메인 탭
const video = document.getElementById('video');
const overlay = document.getElementById('overlay');
const recognizedNameEl = document.getElementById('recognizedName');
const cameraStatusEl = document.getElementById('cameraStatus');
const currentUserNameEl = document.getElementById('currentUserName');
const checkInTimeEl = document.getElementById('checkInTime');
const checkOutTimeEl = document.getElementById('checkOutTime');
const breakTimeEl = document.getElementById('breakTime');
const workDurationEl = document.getElementById('workDuration');
const checkInBtn = document.getElementById('checkInBtn');
const breakBtn = document.getElementById('breakBtn');
const checkOutBtn = document.getElementById('checkOutBtn');
const breakStatusEl = document.getElementById('breakStatus');
const breakTimerEl = document.getElementById('breakTimer');

// DOM 요소 - 등록 탭
const registerVideo = document.getElementById('registerVideo');
const registerOverlay = document.getElementById('registerOverlay');
const userNameInput = document.getElementById('userName');
const registerBtn = document.getElementById('registerBtn');
const registerStatusEl = document.getElementById('registerStatus');

// 상태
let appData = { records: [] };
let facesData = { users: [] };
let today = '';
let currentUser = null;
let stream = null;
let isModelLoaded = false;
let labeledFaceDescriptors = null;

// 휴식 관련 상태
let isOnBreak = false;
let breakStartTime = null;
let breakTimerInterval = null;

// 초기화
async function init() {
  today = await window.electronAPI.getToday();

  // DB 연결 확인
  const isConnected = await window.electronAPI.checkDbConnection();
  if (!isConnected) {
    cameraStatusEl.textContent = 'DB 연결 실패 - 인터넷 확인';
    cameraStatusEl.classList.add('error');
  }

  appData = await window.electronAPI.loadData();
  facesData = await window.electronAPI.loadFaces();

  updateClock();
  setInterval(updateClock, 1000);

  setupTabs();
  await loadFaceApiModels();
  await startCamera();
}

// 탭 설정
function setupTabs() {
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.dataset.tab;

      tabBtns.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));

      btn.classList.add('active');
      document.getElementById(tabId + 'Tab').classList.add('active');
    });
  });
}

// 시계 업데이트
function updateClock() {
  const now = new Date();

  const dateOptions = {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long'
  };
  currentDateEl.textContent = now.toLocaleDateString('ko-KR', dateOptions);

  const timeStr = now.toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  currentTimeEl.textContent = timeStr;
}

// Face API 모델 로드
async function loadFaceApiModels() {
  cameraStatusEl.textContent = 'AI 모델 로딩중...';

  try {
    const modelsPath = './models';

    await Promise.all([
      faceapi.nets.ssdMobilenetv1.loadFromUri(modelsPath),
      faceapi.nets.faceLandmark68Net.loadFromUri(modelsPath),
      faceapi.nets.faceRecognitionNet.loadFromUri(modelsPath)
    ]);

    isModelLoaded = true;
    cameraStatusEl.textContent = '모델 로드 완료';
    cameraStatusEl.classList.add('success');

    await loadLabeledFaceDescriptors();
  } catch (error) {
    console.error('모델 로드 오류:', error);
    cameraStatusEl.textContent = '모델 로드 실패 - models 폴더를 확인하세요';
    cameraStatusEl.classList.add('error');
  }
}

// 등록된 얼굴 디스크립터 로드
async function loadLabeledFaceDescriptors() {
  if (facesData.users.length === 0) {
    labeledFaceDescriptors = null;
    return;
  }

  const labeledDescriptors = facesData.users.map(user => {
    const descriptors = user.descriptors.map(d => new Float32Array(d));
    return new faceapi.LabeledFaceDescriptors(user.name, descriptors);
  });

  labeledFaceDescriptors = labeledDescriptors;
}

// 카메라 시작
async function startCamera() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 320, height: 240, facingMode: 'user' }
    });

    video.srcObject = stream;
    registerVideo.srcObject = stream;

    video.addEventListener('loadedmetadata', () => {
      overlay.width = video.videoWidth;
      overlay.height = video.videoHeight;
      registerOverlay.width = video.videoWidth;
      registerOverlay.height = video.videoHeight;

      if (isModelLoaded) {
        startFaceDetection();
      }
    });

    cameraStatusEl.textContent = '카메라 준비 완료';
    cameraStatusEl.classList.remove('error');
    cameraStatusEl.classList.add('success');
  } catch (error) {
    console.error('카메라 오류:', error);
    cameraStatusEl.textContent = '카메라 접근 실패';
    cameraStatusEl.classList.add('error');
  }
}

// 얼굴 감지 시작
function startFaceDetection() {
  const ctx = overlay.getContext('2d');
  const registerCtx = registerOverlay.getContext('2d');

  setInterval(async () => {
    if (!isModelLoaded) return;

    const mainTab = document.getElementById('mainTab');
    if (mainTab.classList.contains('active')) {
      await detectAndRecognize(video, ctx, overlay);
    }

    const registerTab = document.getElementById('registerTab');
    if (registerTab.classList.contains('active')) {
      await detectForRegister(registerVideo, registerCtx, registerOverlay);
    }
  }, 500);
}

// 얼굴 감지 및 인식 (메인 탭)
async function detectAndRecognize(videoEl, ctx, canvasEl) {
  ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);

  const detection = await faceapi
    .detectSingleFace(videoEl)
    .withFaceLandmarks()
    .withFaceDescriptor();

  if (detection) {
    const dims = faceapi.matchDimensions(canvasEl, videoEl, true);
    const resizedDetection = faceapi.resizeResults(detection, dims);

    const box = resizedDetection.detection.box;
    ctx.strokeStyle = '#4ade80';
    ctx.lineWidth = 2;
    ctx.strokeRect(box.x, box.y, box.width, box.height);

    if (labeledFaceDescriptors && labeledFaceDescriptors.length > 0) {
      const faceMatcher = new faceapi.FaceMatcher(labeledFaceDescriptors, 0.6);
      const match = faceMatcher.findBestMatch(detection.descriptor);

      if (match.label !== 'unknown') {
        currentUser = match.label;
        recognizedNameEl.textContent = currentUser;
        recognizedNameEl.classList.add('show');
        currentUserNameEl.textContent = currentUser;
        updateTodayStatus();
      } else {
        setUnrecognized();
      }
    } else {
      currentUser = null;
      recognizedNameEl.classList.remove('show');
      currentUserNameEl.textContent = '등록된 얼굴 없음';
      resetButtons();
    }
  } else {
    setUnrecognized();
  }
}

function setUnrecognized() {
  currentUser = null;
  recognizedNameEl.classList.remove('show');
  currentUserNameEl.textContent = '미인식';
  resetTodayStatus();
  resetButtons();
}

// 얼굴 감지 (등록 탭)
let detectedDescriptor = null;

async function detectForRegister(videoEl, ctx, canvasEl) {
  ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);

  const detection = await faceapi
    .detectSingleFace(videoEl)
    .withFaceLandmarks()
    .withFaceDescriptor();

  if (detection) {
    const dims = faceapi.matchDimensions(canvasEl, videoEl, true);
    const resizedDetection = faceapi.resizeResults(detection, dims);

    const box = resizedDetection.detection.box;
    ctx.strokeStyle = '#667eea';
    ctx.lineWidth = 2;
    ctx.strokeRect(box.x, box.y, box.width, box.height);

    detectedDescriptor = detection.descriptor;
    registerBtn.disabled = !userNameInput.value.trim();
    registerStatusEl.textContent = '얼굴 감지됨';
    registerStatusEl.className = 'register-status success';
  } else {
    detectedDescriptor = null;
    registerBtn.disabled = true;
    registerStatusEl.textContent = '얼굴을 카메라에 비춰주세요';
    registerStatusEl.className = 'register-status';
  }
}

// 오늘 기록 찾기
function getTodayRecord(userName) {
  return appData.records.find(r => r.date === today && r.userName === userName);
}

// 오늘 상태 업데이트
function updateTodayStatus() {
  if (!currentUser) {
    resetTodayStatus();
    return;
  }

  const todayRecord = getTodayRecord(currentUser);

  if (todayRecord) {
    checkInTimeEl.textContent = todayRecord.checkIn || '--:--';
    checkOutTimeEl.textContent = todayRecord.checkOut || '--:--';

    // 휴식 시간 표시
    const totalBreak = todayRecord.totalBreakMinutes || 0;
    breakTimeEl.textContent = `${totalBreak}분`;

    // 현재 휴식 중인지 확인
    if (todayRecord.breakStart && !todayRecord.checkOut) {
      isOnBreak = true;
      breakStartTime = new Date(todayRecord.breakStart);
      startBreakTimer();
      breakBtn.textContent = '복귀';
      breakBtn.classList.add('active');
      breakStatusEl.classList.remove('hidden');
    } else {
      isOnBreak = false;
      breakStartTime = null;
      stopBreakTimer();
      breakBtn.textContent = '휴식';
      breakBtn.classList.remove('active');
      breakStatusEl.classList.add('hidden');
    }

    if (todayRecord.checkIn && todayRecord.checkOut) {
      // 퇴근 완료
      const workMins = calculateWorkMinutes(todayRecord.checkIn, todayRecord.checkOut, totalBreak);
      workDurationEl.textContent = formatDuration(workMins);
      checkInBtn.disabled = true;
      breakBtn.disabled = true;
      checkOutBtn.disabled = true;
    } else if (todayRecord.checkIn) {
      // 근무 중
      workDurationEl.textContent = '근무중...';
      checkInBtn.disabled = true;
      breakBtn.disabled = false;
      checkOutBtn.disabled = isOnBreak; // 휴식 중에는 퇴근 불가
    }
  } else {
    resetTodayStatus();
    checkInBtn.disabled = false;
    breakBtn.disabled = true;
    checkOutBtn.disabled = true;
  }
}

// 상태 초기화
function resetTodayStatus() {
  checkInTimeEl.textContent = '--:--';
  checkOutTimeEl.textContent = '--:--';
  breakTimeEl.textContent = '0분';
  workDurationEl.textContent = '--:--';
}

function resetButtons() {
  checkInBtn.disabled = true;
  breakBtn.disabled = true;
  checkOutBtn.disabled = true;
}

// 근무시간 계산 (분 단위)
function calculateWorkMinutes(checkIn, checkOut, breakMinutes) {
  const [inH, inM] = checkIn.split(':').map(Number);
  const [outH, outM] = checkOut.split(':').map(Number);

  let totalMinutes = (outH * 60 + outM) - (inH * 60 + inM);
  if (totalMinutes < 0) totalMinutes += 24 * 60;

  return Math.max(0, totalMinutes - breakMinutes);
}

// 시간 포맷팅
function formatDuration(minutes) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}시간 ${mins}분`;
}

// 현재 시간 가져오기
function getCurrentTimeString() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

// 출근 처리
async function checkIn() {
  if (!currentUser) return;

  const timeStr = getCurrentTimeString();

  let todayRecord = getTodayRecord(currentUser);
  if (!todayRecord) {
    todayRecord = {
      date: today,
      userName: currentUser,
      checkIn: timeStr,
      checkOut: null,
      totalBreakMinutes: 0,
      breakStart: null
    };
    appData.records.unshift(todayRecord);
  } else {
    todayRecord.checkIn = timeStr;
  }

  await window.electronAPI.saveRecord(todayRecord);
  updateTodayStatus();
}

// 휴식 시작/종료
async function toggleBreak() {
  if (!currentUser) return;

  const todayRecord = getTodayRecord(currentUser);
  if (!todayRecord || !todayRecord.checkIn) return;

  if (isOnBreak) {
    // 휴식 종료
    const now = new Date();
    const breakMins = Math.floor((now - breakStartTime) / 60000);
    todayRecord.totalBreakMinutes = (todayRecord.totalBreakMinutes || 0) + breakMins;
    todayRecord.breakStart = null;

    isOnBreak = false;
    breakStartTime = null;
    stopBreakTimer();
  } else {
    // 휴식 시작
    todayRecord.breakStart = new Date().toISOString();
    isOnBreak = true;
    breakStartTime = new Date();
    startBreakTimer();
  }

  await window.electronAPI.saveRecord(todayRecord);
  updateTodayStatus();
}

// 휴식 타이머 시작
function startBreakTimer() {
  stopBreakTimer();
  updateBreakTimer();
  breakTimerInterval = setInterval(updateBreakTimer, 1000);
}

// 휴식 타이머 중지
function stopBreakTimer() {
  if (breakTimerInterval) {
    clearInterval(breakTimerInterval);
    breakTimerInterval = null;
  }
}

// 휴식 타이머 업데이트
function updateBreakTimer() {
  if (!breakStartTime) return;

  const now = new Date();
  const diffMs = now - breakStartTime;
  const mins = Math.floor(diffMs / 60000);
  const secs = Math.floor((diffMs % 60000) / 1000);

  breakTimerEl.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

// 퇴근 처리
async function checkOut() {
  if (!currentUser || isOnBreak) return;

  const timeStr = getCurrentTimeString();

  const todayRecord = getTodayRecord(currentUser);
  if (todayRecord) {
    todayRecord.checkOut = timeStr;
    await window.electronAPI.saveRecord(todayRecord);
    updateTodayStatus();
  }
}

// 얼굴 등록
async function registerFace() {
  const name = userNameInput.value.trim();
  if (!name || !detectedDescriptor) return;

  const existingUser = facesData.users.find(u => u.name === name);

  let user;
  if (existingUser) {
    existingUser.descriptors.push(Array.from(detectedDescriptor));
    user = existingUser;
  } else {
    user = {
      name: name,
      registeredAt: new Date().toISOString(),
      descriptors: [Array.from(detectedDescriptor)]
    };
    facesData.users.push(user);
  }

  await window.electronAPI.saveFace(user);
  await loadLabeledFaceDescriptors();

  userNameInput.value = '';
  registerStatusEl.textContent = `${name} 등록 완료!`;
  registerStatusEl.className = 'register-status success';
  registerBtn.disabled = true;
}

// 이벤트 리스너
checkInBtn.addEventListener('click', checkIn);
breakBtn.addEventListener('click', toggleBreak);
checkOutBtn.addEventListener('click', checkOut);
registerBtn.addEventListener('click', registerFace);

userNameInput.addEventListener('input', () => {
  registerBtn.disabled = !userNameInput.value.trim() || !detectedDescriptor;
});

// 앱 시작
init();
