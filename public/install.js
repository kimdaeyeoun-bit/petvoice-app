(()=>{
let prompt;
const button=document.querySelector('#install-app');
const status=document.querySelector('#install-status');
const installed=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone;
function render(){button.hidden=!!installed();}
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();prompt=e;button.textContent='LUMINA 앱 설치';});
window.addEventListener('appinstalled',()=>{prompt=null;render();status.textContent='LUMINA가 홈 화면에 설치되었습니다.';});
button.addEventListener('click',async()=>{if(prompt){const pending=prompt;prompt=null;await pending.prompt();await pending.userChoice;return;}const ios=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);status.textContent=ios?'아이폰: Safari에서 이 사이트를 열고 공유 → 홈 화면에 추가를 선택하세요.':'안드로이드: Chrome 메뉴 ⋮ → 앱 설치 또는 홈 화면에 추가를 선택하세요. 설치 메뉴가 없으면 HTTPS 사이트 주소로 접속했는지 확인하세요.';status.scrollIntoView({block:'center',behavior:'smooth'});});
if('serviceWorker' in navigator&&window.isSecureContext)navigator.serviceWorker.register('/sw.js').catch(()=>{status.textContent='앱 설치 준비에 실패했습니다. 인터넷 연결을 확인하고 새로고침해 주세요.';});
render();
})();
