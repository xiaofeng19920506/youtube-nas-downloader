import DownloadPage from './DownloadPage';

export default function App() {
  return (
    <div className="app">
      <header className="app-header">
        <h1>YouTube 下载到 NAS</h1>
        <p className="app-tagline">粘贴链接，保存 MP4 到飞牛影视目录</p>
      </header>
      <main>
        <DownloadPage />
      </main>
    </div>
  );
}
