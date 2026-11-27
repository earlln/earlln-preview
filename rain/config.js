// 중계 서버 주소. 같은 사이트 경로(/rain-api)를 먼저 쓰고, 안 되면 workers.dev 주소로 다시 시도한다.
window.RAIN_CONFIG = {
  proxies: ['/rain-api', 'https://earllnrainornot-proxy.earlln.workers.dev'],
  // 전국 국도(ITS) CCTV: ITS 서버가 해외 접속을 막아 국내 서버(카페24)의 PHP 로 중계한다
  its: '/rain-its.php'
};
