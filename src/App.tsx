import { Route, Routes } from 'react-router-dom';
import { AppProvider } from './AppContext';
import { Shell } from './components/Shell';
import Analytics from './pages/Analytics';
import Assets from './pages/Assets';
import Branding from './pages/Branding';
import Calendar from './pages/Calendar';
import Help from './pages/Help';
import Home from './pages/Home';
import Images from './pages/Images';
import NewProject from './pages/NewProject';
import Settings from './pages/Settings';
import Videos from './pages/Videos';
import Workspace from './pages/Workspace';
import { Placeholder } from './pages/Placeholder';

export default function App() {
  return (
    <AppProvider>
      <Routes>
        <Route element={<Shell />}>
          <Route index element={<Home />} />
          <Route path="videos" element={<Videos />} />
          <Route path="videos/new" element={<NewProject />} />
          <Route path="videos/:id" element={<Workspace />} />
          <Route path="images" element={<Images />} />
          <Route path="assets" element={<Assets />} />
          <Route path="calendar" element={<Calendar />} />
          <Route path="branding" element={<Branding />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="settings" element={<Settings />} />
          <Route path="help" element={<Help />} />
          <Route path="*" element={<Placeholder title="Page not found" note="That page does not exist. Use the menu to get back." />} />
        </Route>
      </Routes>
    </AppProvider>
  );
}
