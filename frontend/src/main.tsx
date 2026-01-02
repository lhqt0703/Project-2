import ReactDOM from 'react-dom/client'
import App from './App'
import { BrowserRouter } from 'react-router-dom'
import { RoomProvider } from './context/RoomContext'
import './theme.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <RoomProvider>
      <App />
    </RoomProvider>
  </BrowserRouter>,
)
