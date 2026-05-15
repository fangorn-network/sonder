import React, { useState } from 'react'
import Nav from './components/Nav'
import Hero from './components/Hero'
import Thesis from './components/Thesis'
import TabSwitcher from './components/TabSwitcher'
import ListenerPage from './components/ListenerPage'
import ArtistPage from './components/ArtistPage'
import Footer from './components/Footer'
import './App.css'

export default function App() {
  const [tab, setTab] = useState('listener')

  return (
    <div className="app">
      <Nav tab={tab} setTab={setTab} />
      <Hero tab={tab} />
      <Thesis />
      <TabSwitcher tab={tab} setTab={setTab} />
      {tab === 'listener' ? <ListenerPage /> : <ArtistPage />}
      <Footer tab={tab} />
    </div>
  )
}
