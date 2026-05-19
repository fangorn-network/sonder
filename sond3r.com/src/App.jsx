import React, { useState } from 'react'
import Nav from './components/Nav'
import Hero from './components/Hero'
import Problem from './components/Problem'
import Product from './components/Product'
import Support from './components/Support'
import Footer from './components/Footer'
import EntryOverlay from './components/EntryOverlay'
import './App.css'

export default function App() {
  const [entered, setEntered] = useState(false)

  return (
    <div className="app">
      {!entered && <EntryOverlay onEnter={() => setEntered(true)} />}
      <Nav />
      <Hero />
      <Problem />
      <Product />
      <Support />
      <Footer />
    </div>
  )
}