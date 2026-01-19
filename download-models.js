const https = require('https');
const fs = require('fs');
const path = require('path');

const modelsDir = path.join(__dirname, 'models');

// face-api.js 모델 파일 목록
const models = [
  'ssd_mobilenetv1_model-weights_manifest.json',
  'ssd_mobilenetv1_model-shard1',
  'ssd_mobilenetv1_model-shard2',
  'face_landmark_68_model-weights_manifest.json',
  'face_landmark_68_model-shard1',
  'face_recognition_model-weights_manifest.json',
  'face_recognition_model-shard1',
  'face_recognition_model-shard2'
];

const baseUrl = 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights';

// 디렉토리 생성
if (!fs.existsSync(modelsDir)) {
  fs.mkdirSync(modelsDir, { recursive: true });
}

console.log('face-api.js 모델 다운로드 시작...\n');

let completed = 0;
const total = models.length;

function downloadFile(filename) {
  return new Promise((resolve, reject) => {
    const filePath = path.join(modelsDir, filename);
    const url = `${baseUrl}/${filename}`;

    const file = fs.createWriteStream(filePath);

    https.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        // 리다이렉트 처리
        https.get(response.headers.location, (redirectResponse) => {
          redirectResponse.pipe(file);
          file.on('finish', () => {
            file.close();
            completed++;
            console.log(`[${completed}/${total}] ${filename} 완료`);
            resolve();
          });
        }).on('error', reject);
      } else {
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          completed++;
          console.log(`[${completed}/${total}] ${filename} 완료`);
          resolve();
        });
      }
    }).on('error', (err) => {
      fs.unlink(filePath, () => {});
      reject(err);
    });
  });
}

async function downloadAll() {
  for (const model of models) {
    try {
      await downloadFile(model);
    } catch (error) {
      console.error(`오류: ${model} 다운로드 실패 - ${error.message}`);
    }
  }

  console.log('\n모델 다운로드 완료!');
  console.log('이제 "npm start"로 앱을 실행할 수 있습니다.');
}

downloadAll();
