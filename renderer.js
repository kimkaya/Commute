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
const authStatusEl = document.getElementById('authStatus');
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
const userPasswordInput = document.getElementById('userPassword');
const userPasswordConfirmInput = document.getElementById('userPasswordConfirm');
const registerBtn = document.getElementById('registerBtn');
const registerStatusEl = document.getElementById('registerStatus');

// 개인정보 동의 체크박스
const privacyConsent = document.getElementById('privacyConsent');
const biometricConsent = document.getElementById('biometricConsent');
const dataRetentionConsent = document.getElementById('dataRetentionConsent');

// DOM 요소 - 비밀번호 모달
const passwordModal = document.getElementById('passwordModal');
const passwordModalUser = document.getElementById('passwordModalUser');
const devicePasswordInput = document.getElementById('devicePassword');
const passwordModalError = document.getElementById('passwordModalError');
const verifyPasswordBtn = document.getElementById('verifyPasswordBtn');
const cancelPasswordBtn = document.getElementById('cancelPasswordBtn');

// DOM 요소 - 긴급/수동 입력
const emergencyBtn = document.getElementById('emergencyBtn');
const manualAuthBtn = document.getElementById('manualAuthBtn');
const dbStatus = document.getElementById('dbStatus');
const networkStatus = document.getElementById('networkStatus');

// DOM 요소 - 긴급 모달
const emergencyModal = document.getElementById('emergencyModal');
const emergencyUserSelect = document.getElementById('emergencyUserSelect');
const emergencyPassword = document.getElementById('emergencyPassword');
const emergencyReason = document.getElementById('emergencyReason');
const emergencyError = document.getElementById('emergencyError');
const emergencyCheckInBtn = document.getElementById('emergencyCheckInBtn');
const emergencyBreakBtn = document.getElementById('emergencyBreakBtn');
const emergencyCheckOutBtn = document.getElementById('emergencyCheckOutBtn');
const cancelEmergencyBtn = document.getElementById('cancelEmergencyBtn');

// DOM 요소 - 수동 인증 모달
const manualAuthModal = document.getElementById('manualAuthModal');
const manualUserSelect = document.getElementById('manualUserSelect');
const manualPassword = document.getElementById('manualPassword');
const manualAuthError = document.getElementById('manualAuthError');
const manualAuthVerifyBtn = document.getElementById('manualAuthVerifyBtn');
const cancelManualAuthBtn = document.getElementById('cancelManualAuthBtn');

// DOM 요소 - 오프라인 모달
const offlineModal = document.getElementById('offlineModal');
const offlineCount = document.getElementById('offlineCount');
const lastSync = document.getElementById('lastSync');
const continueOfflineBtn = document.getElementById('continueOfflineBtn');
const retryConnectionBtn = document.getElementById('retryConnectionBtn');

// 상태
let appData = { records: [] };
let facesData = { users: [] };
let today = '';
let currentUser = null;
let stream = null;
let isModelLoaded = false;
let labeledFaceDescriptors = null;

// 기기 인증 상태
let isDeviceAuthorized = false;
let pendingAuthUser = null;

// 휴식 관련 상태
let isOnBreak = false;
let breakStartTime = null;
let breakTimerInterval = null;

// 새로운 예외 처리 상태
let isOfflineMode = false;
let offlineRecords = [];
let networkCheckInterval = null;
let manualAuthenticatedUser = null;
let registeredUsers = [];

// 초기화
async function init() {
  today = await window.electronAPI.getToday();

  // DB 연결 및 네트워크 상태 확인
  await checkConnectionStatus();
  
  // 등록된 사용자 목록 로드
  await loadRegisteredUsers();
  
  // 오프라인 기록 복원
  loadOfflineRecords();

  appData = await window.electronAPI.loadData();
  facesData = await window.electronAPI.loadFaces();

  updateClock();
  setInterval(updateClock, 1000);
  
  // 정기적 네트워크 상태 확인
  networkCheckInterval = setInterval(checkConnectionStatus, 30000); // 30초마다

  setupTabs();
  setupPasswordModal();
  setupEmergencyHandlers();
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

// 비밀번호 모달 설정
function setupPasswordModal() {
  verifyPasswordBtn.addEventListener('click', verifyDevicePassword);
  cancelPasswordBtn.addEventListener('click', closePasswordModal);

  devicePasswordInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') verifyDevicePassword();
  });
}

// 비밀번호 모달 열기
function openPasswordModal(userName) {
  pendingAuthUser = userName;
  passwordModalUser.textContent = `${userName}님`;
  devicePasswordInput.value = '';
  passwordModalError.textContent = '';
  passwordModal.classList.remove('hidden');
  devicePasswordInput.focus();
}

// 비밀번호 모달 닫기
function closePasswordModal() {
  passwordModal.classList.add('hidden');
  pendingAuthUser = null;
  devicePasswordInput.value = '';
  passwordModalError.textContent = '';
}

// 비밀번호 확인 및 기기 등록
async function verifyDevicePassword() {
  const password = devicePasswordInput.value;

  if (!password) {
    passwordModalError.textContent = '비밀번호를 입력하세요.';
    return;
  }

  if (!pendingAuthUser) return;

  const result = await window.electronAPI.verifyAndRegisterDevice(pendingAuthUser, password);

  if (result.success) {
    closePasswordModal();
    isDeviceAuthorized = true;
    authStatusEl.textContent = '기기 인증 완료';
    authStatusEl.className = 'auth-status success';
    updateTodayStatus();
  } else {
    passwordModalError.textContent = result.message;
    devicePasswordInput.value = '';
    devicePasswordInput.focus();
  }
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
        const userName = match.label;

        // 사용자가 변경되면 기기 인증 재확인
        if (currentUser !== userName) {
          currentUser = userName;
          isDeviceAuthorized = false;
          await checkDeviceAuthorization(userName);
        }

        recognizedNameEl.textContent = currentUser;
        recognizedNameEl.classList.add('show');
        currentUserNameEl.textContent = currentUser;
        updateTodayStatus();
      } else {
        setUnrecognized();
      }
    } else {
      currentUser = null;
      isDeviceAuthorized = false;
      recognizedNameEl.classList.remove('show');
      currentUserNameEl.textContent = '등록된 얼굴 없음';
      resetButtons();
    }
  } else {
    setUnrecognized();
  }
}

// 기기 인증 확인
async function checkDeviceAuthorization(userName) {
  const result = await window.electronAPI.checkDeviceAuth(userName);

  if (result.success) {
    if (result.authorized) {
      isDeviceAuthorized = true;
      authStatusEl.textContent = '';
    } else {
      isDeviceAuthorized = false;
      authStatusEl.textContent = '새 기기 - 비밀번호 필요';
      authStatusEl.className = 'auth-status warning';
      openPasswordModal(userName);
    }
  } else {
    isDeviceAuthorized = false;
    authStatusEl.textContent = '인증 오류';
    authStatusEl.className = 'auth-status error';
  }
}

function setUnrecognized() {
  currentUser = null;
  isDeviceAuthorized = false;
  recognizedNameEl.classList.remove('show');
  currentUserNameEl.textContent = '미인식';
  authStatusEl.textContent = '';
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
    validateRegisterForm();
    registerStatusEl.textContent = '얼굴 감지됨';
    registerStatusEl.className = 'register-status success';
  } else {
    detectedDescriptor = null;
    registerBtn.disabled = true;
    registerStatusEl.textContent = '얼굴을 카메라에 비춰주세요';
    registerStatusEl.className = 'register-status';
  }
}

// 등록 폼 검증
function validateRegisterForm() {
  const name = userNameInput.value.trim();
  const password = userPasswordInput.value;
  const passwordConfirm = userPasswordConfirmInput.value;

  // 기존 사용자인지 확인
  const existingUser = facesData.users.find(u => u.name === name);

  if (existingUser) {
    // 기존 사용자: 얼굴만 추가 (비밀번호 및 동의 불필요)
    registerBtn.disabled = !name || !detectedDescriptor;
  } else {
    // 새 사용자: 비밀번호 + 개인정보 동의 필수
    const isValid = name &&
      detectedDescriptor &&
      password.length >= 4 &&
      password === passwordConfirm &&
      privacyConsent.checked &&
      biometricConsent.checked &&
      dataRetentionConsent.checked;
    registerBtn.disabled = !isValid;
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
      // 근무 중 - 기기 인증 확인
      workDurationEl.textContent = '근무중...';
      checkInBtn.disabled = true;
      breakBtn.disabled = !isDeviceAuthorized;
      checkOutBtn.disabled = !isDeviceAuthorized || isOnBreak;
    }
  } else {
    resetTodayStatus();
    // 출근 버튼은 기기 인증 완료 시에만 활성화
    checkInBtn.disabled = !isDeviceAuthorized;
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
  if (!currentUser || !isDeviceAuthorized) return;

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
  if (!currentUser || !isDeviceAuthorized) return;

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
  if (!currentUser || !isDeviceAuthorized || isOnBreak) return;

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
  const password = userPasswordInput.value;
  const passwordConfirm = userPasswordConfirmInput.value;

  if (!name || !detectedDescriptor) return;

  // 개인정보 동의 확인
  if (!privacyConsent.checked || !biometricConsent.checked || !dataRetentionConsent.checked) {
    registerStatusEl.textContent = '개인정보 수집·이용 동의가 필요합니다.';
    registerStatusEl.className = 'register-status error';
    return;
  }

  const existingUser = facesData.users.find(u => u.name === name);

  let user;
  if (existingUser) {
    // 기존 사용자: 얼굴 디스크립터 추가
    existingUser.descriptors.push(Array.from(detectedDescriptor));
    user = existingUser;

    await window.electronAPI.saveFace(user);
    await loadLabeledFaceDescriptors();

    registerStatusEl.textContent = `${name} 얼굴 추가 완료!`;
    registerStatusEl.className = 'register-status success';
  } else {
    // 새 사용자: 비밀번호 필수
    if (password.length < 4) {
      registerStatusEl.textContent = '비밀번호는 4자리 이상이어야 합니다.';
      registerStatusEl.className = 'register-status error';
      return;
    }

    if (password !== passwordConfirm) {
      registerStatusEl.textContent = '비밀번호가 일치하지 않습니다.';
      registerStatusEl.className = 'register-status error';
      return;
    }

    user = {
      name: name,
      registeredAt: new Date().toISOString(),
      descriptors: [Array.from(detectedDescriptor)],
      password: password, // main.js에서 해시 처리
      // 개인정보 동의 기록
      privacyConsent: {
        agreedAt: new Date().toISOString(),
        privacyPolicy: true,
        biometricData: true,
        dataRetention: true,
        retentionPeriod: 'until_resignation' // 퇴직 시까지
      }
    };

    facesData.users.push({
      name: user.name,
      descriptors: user.descriptors,
      registeredAt: user.registeredAt,
      registeredDevices: []
    });

    await window.electronAPI.saveFace(user);
    await loadLabeledFaceDescriptors();

    // 새로 등록한 사용자는 자동으로 이 기기에서 인증됨
    facesData = await window.electronAPI.loadFaces();

    registerStatusEl.textContent = `${name} 등록 완료!`;
    registerStatusEl.className = 'register-status success';
  }

  // 입력 필드 초기화
  userNameInput.value = '';
  userPasswordInput.value = '';
  userPasswordConfirmInput.value = '';
  registerBtn.disabled = true;
}

// 이벤트 리스너
checkInBtn.addEventListener('click', checkIn);
breakBtn.addEventListener('click', toggleBreak);
checkOutBtn.addEventListener('click', checkOut);
registerBtn.addEventListener('click', registerFace);

userNameInput.addEventListener('input', validateRegisterForm);
userPasswordInput.addEventListener('input', validateRegisterForm);
userPasswordConfirmInput.addEventListener('input', validateRegisterForm);

// 개인정보 동의 체크박스 이벤트
privacyConsent.addEventListener('change', validateRegisterForm);
biometricConsent.addEventListener('change', validateRegisterForm);
dataRetentionConsent.addEventListener('change', validateRegisterForm);

// ===== 예외 처리 기능들 =====

// 네트워크/DB 연결 상태 확인
async function checkConnectionStatus() {
  try {
    const status = await window.electronAPI.checkNetworkStatus();
    
    // DB 상태 업데이트
    if (status.dbConnected) {
      dbStatus.textContent = '🟢 DB 연결됨';
      dbStatus.className = 'status-indicator online';
    } else {
      dbStatus.textContent = '🔴 DB 끊김';
      dbStatus.className = 'status-indicator offline';
    }
    
    // 네트워크 상태 업데이트
    if (status.online) {
      networkStatus.textContent = '🟢 온라인';
      networkStatus.className = 'status-indicator online';
      
      // 온라인 복구 시 오프라인 기록 동기화
      if (isOfflineMode && offlineRecords.length > 0) {
        await syncOfflineRecords();
      }
      isOfflineMode = false;
    } else {
      networkStatus.textContent = '🔴 오프라인';
      networkStatus.className = 'status-indicator offline';
      
      if (!isOfflineMode) {
        isOfflineMode = true;
        showOfflineModal();
      }
    }
    
  } catch (error) {
    console.error('연결 상태 확인 오류:', error);
    dbStatus.textContent = '🟡 확인 불가';
    dbStatus.className = 'status-indicator warning';
  }
}

// 등록된 사용자 목록 로드
async function loadRegisteredUsers() {
  try {
    const result = await window.electronAPI.getRegisteredUsers();
    if (result.success) {
      registeredUsers = result.users;
      
      // 긴급 모달 사용자 목록 업데이트
      updateUserSelects();
    }
  } catch (error) {
    console.error('사용자 목록 로드 오류:', error);
  }
}

// 사용자 선택 드롭다운 업데이트
function updateUserSelects() {
  const selects = [emergencyUserSelect, manualUserSelect];
  
  selects.forEach(select => {
    // 기존 옵션 제거 (첫 번째 옵션 제외)
    while (select.children.length > 1) {
      select.removeChild(select.lastChild);
    }
    
    // 등록된 사용자 추가
    registeredUsers.forEach(user => {
      const option = document.createElement('option');
      option.value = user.name;
      option.textContent = user.name;
      select.appendChild(option);
    });
  });
}

// 이벤트 핸들러 설정
function setupEmergencyHandlers() {
  // 긴급 버튼
  emergencyBtn.addEventListener('click', showEmergencyModal);
  manualAuthBtn.addEventListener('click', showManualAuthModal);
  
  // 긴급 모달
  emergencyCheckInBtn.addEventListener('click', () => handleEmergencyAction('checkIn'));
  emergencyBreakBtn.addEventListener('click', () => handleEmergencyAction('break'));
  emergencyCheckOutBtn.addEventListener('click', () => handleEmergencyAction('checkOut'));
  cancelEmergencyBtn.addEventListener('click', hideEmergencyModal);
  
  // 수동 인증 모달
  manualAuthVerifyBtn.addEventListener('click', handleManualAuth);
  cancelManualAuthBtn.addEventListener('click', hideManualAuthModal);
  
  // 오프라인 모달
  continueOfflineBtn.addEventListener('click', hideOfflineModal);
  retryConnectionBtn.addEventListener('click', retryConnection);
}

// 긴급 모달 표시
function showEmergencyModal() {
  emergencyModal.classList.remove('hidden');
  emergencyError.textContent = '';
  emergencyUserSelect.value = '';
  emergencyPassword.value = '';
  emergencyReason.value = 'camera_failure';
}

// 긴급 모달 숨김
function hideEmergencyModal() {
  emergencyModal.classList.add('hidden');
}

// 긴급 출퇴근 처리
async function handleEmergencyAction(action) {
  const userName = emergencyUserSelect.value;
  const password = emergencyPassword.value;
  const reason = emergencyReason.value;
  
  if (!userName || !password) {
    emergencyError.textContent = '직원과 비밀번호를 모두 입력하세요.';
    return;
  }
  
  try {
    // 비밀번호 확인
    const authResult = await window.electronAPI.verifyPasswordOnly(userName, password);
    if (!authResult.success) {
      emergencyError.textContent = authResult.message;
      return;
    }
    
    // 긴급 기록 생성
    const timeStr = getCurrentTimeString();
    const record = {
      date: today,
      userName: userName,
      checkIn: action === 'checkIn' ? timeStr : null,
      checkOut: action === 'checkOut' ? timeStr : null,
      totalBreakMinutes: 0,
      breakStart: action === 'break' ? timeStr : null,
      isEmergency: true,
      emergencyReason: reason
    };
    
    // 오프라인이면 로컬 저장, 온라인이면 서버 저장
    if (isOfflineMode) {
      saveOfflineRecord(record);
      emergencyError.textContent = '✅ 오프라인 기록으로 저장됨';
      emergencyError.style.color = '#22c55e';
    } else {
      const result = await window.electronAPI.saveEmergencyRecord(record, reason);
      if (result.success) {
        emergencyError.textContent = '✅ ' + result.message;
        emergencyError.style.color = '#22c55e';
      } else {
        emergencyError.textContent = result.message;
        return;
      }
    }
    
    setTimeout(() => {
      hideEmergencyModal();
    }, 2000);
    
  } catch (error) {
    emergencyError.textContent = '오류가 발생했습니다: ' + error.message;
  }
}

// 수동 인증 모달 표시
function showManualAuthModal() {
  manualAuthModal.classList.remove('hidden');
  manualAuthError.textContent = '';
  manualUserSelect.value = '';
  manualPassword.value = '';
}

// 수동 인증 모달 숨김
function hideManualAuthModal() {
  manualAuthModal.classList.add('hidden');
}

// 수동 비밀번호 인증
async function handleManualAuth() {
  const userName = manualUserSelect.value;
  const password = manualPassword.value;
  
  if (!userName || !password) {
    manualAuthError.textContent = '직원과 비밀번호를 모두 입력하세요.';
    return;
  }
  
  try {
    const result = await window.electronAPI.verifyPasswordOnly(userName, password);
    
    if (result.success) {
      // 수동 인증 성공
      manualAuthenticatedUser = userName;
      currentUser = userName;
      isDeviceAuthorized = true;
      
      authStatusEl.textContent = `${userName} - 수동 인증 완료`;
      authStatusEl.className = 'auth-status success';
      
      updateTodayStatus();
      hideManualAuthModal();
      
      manualAuthError.textContent = '✅ 인증 성공';
      manualAuthError.style.color = '#22c55e';
    } else {
      manualAuthError.textContent = result.message;
    }
  } catch (error) {
    manualAuthError.textContent = '인증 중 오류가 발생했습니다.';
  }
}

// 오프라인 모달 표시
function showOfflineModal() {
  updateOfflineStats();
  offlineModal.classList.remove('hidden');
}

// 오프라인 모달 숨김
function hideOfflineModal() {
  offlineModal.classList.add('hidden');
}

// 연결 재시도
async function retryConnection() {
  await checkConnectionStatus();
  if (!isOfflineMode) {
    hideOfflineModal();
  }
}

// 오프라인 통계 업데이트
function updateOfflineStats() {
  offlineCount.textContent = offlineRecords.length;
  
  const lastSyncTime = localStorage.getItem('lastSyncTime');
  if (lastSyncTime) {
    const date = new Date(lastSyncTime);
    lastSync.textContent = date.toLocaleString('ko-KR');
  } else {
    lastSync.textContent = '없음';
  }
}

// 오프라인 기록 로컬 저장
function saveOfflineRecord(record) {
  record.offlineTimestamp = Date.now();
  record.synced = false;
  offlineRecords.push(record);
  localStorage.setItem('offlineRecords', JSON.stringify(offlineRecords));
  updateOfflineStats();
}

// 오프라인 기록 복원
function loadOfflineRecords() {
  try {
    const stored = localStorage.getItem('offlineRecords');
    if (stored) {
      offlineRecords = JSON.parse(stored).filter(r => !r.synced);
    }
  } catch (error) {
    console.error('오프라인 기록 로드 오류:', error);
    offlineRecords = [];
  }
}

// 오프라인 기록 동기화
async function syncOfflineRecords() {
  if (offlineRecords.length === 0) return;
  
  try {
    const result = await window.electronAPI.syncOfflineRecords(offlineRecords);
    
    if (result.success) {
      // 동기화된 기록들을 제거
      offlineRecords = offlineRecords.filter(record => {
        const syncedRecord = result.results.find(r => 
          r.offlineTimestamp === record.offlineTimestamp
        );
        return !syncedRecord?.synced;
      });
      
      localStorage.setItem('offlineRecords', JSON.stringify(offlineRecords));
      localStorage.setItem('lastSyncTime', new Date().toISOString());
      
      console.log('오프라인 기록 동기화 완료');
    }
  } catch (error) {
    console.error('동기화 오류:', error);
  }
}

// 수정된 저장 함수들 (오프라인 지원)
async function saveRecordWithOfflineSupport(record) {
  if (isOfflineMode) {
    saveOfflineRecord(record);
    return true;
  } else {
    try {
      return await window.electronAPI.saveRecord(record);
    } catch (error) {
      // 온라인이었는데 저장 실패 시 오프라인으로 전환
      console.error('온라인 저장 실패, 오프라인 모드로 전환:', error);
      saveOfflineRecord(record);
      isOfflineMode = true;
      await checkConnectionStatus();
      return true;
    }
  }
}

// 기존 저장 함수들 수정
const originalCheckIn = checkIn;
const originalCheckOut = checkOut;
const originalToggleBreak = toggleBreak;

async function checkIn() {
  if (!currentUser || !isDeviceAuthorized) return;

  const timeStr = getCurrentTimeString();
  
  let todayRecord = getTodayRecord(currentUser);
  if (!todayRecord) {
    todayRecord = {
      date: today,
      userName: currentUser,
      checkIn: null,
      checkOut: null,
      totalBreakMinutes: 0,
      breakStart: null
    };
    appData.records.push(todayRecord);
  }
  
  todayRecord.checkIn = timeStr;
  await saveRecordWithOfflineSupport(todayRecord);
  updateTodayStatus();
}

async function checkOut() {
  if (!currentUser || !isDeviceAuthorized || isOnBreak) return;

  const timeStr = getCurrentTimeString();
  
  const todayRecord = getTodayRecord(currentUser);
  if (todayRecord) {
    todayRecord.checkOut = timeStr;
    await saveRecordWithOfflineSupport(todayRecord);
    updateTodayStatus();
  }
}

async function toggleBreak() {
  if (!currentUser || !isDeviceAuthorized) return;

  const todayRecord = getTodayRecord(currentUser);
  if (!todayRecord) return;

  if (isOnBreak) {
    // 휴식 종료
    if (breakStartTime) {
      const now = new Date();
      const breakDuration = Math.floor((now - breakStartTime) / 60000); // 분 단위
      todayRecord.totalBreakMinutes = (todayRecord.totalBreakMinutes || 0) + breakDuration;
      todayRecord.breakStart = null;
    }
    
    isOnBreak = false;
    breakStartTime = null;
    breakBtn.textContent = '휴식';
    breakBtn.className = 'btn btn-break';
    breakStatusEl.classList.add('hidden');
    stopBreakTimer();
  } else {
    // 휴식 시작
    isOnBreak = true;
    breakStartTime = new Date();
    todayRecord.breakStart = getCurrentTimeString();
    
    breakBtn.textContent = '휴식 종료';
    breakBtn.className = 'btn btn-break active';
    breakStatusEl.classList.remove('hidden');
    startBreakTimer();
  }

  await saveRecordWithOfflineSupport(todayRecord);
  updateTodayStatus();
}

// 앱 시작
init();
