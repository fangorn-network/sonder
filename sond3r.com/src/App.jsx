import React from 'react'
import Nav from './components/Nav'
import Hero from './components/Hero'
import Problem from './components/Problem'
import Product from './components/Product'
import Support from './components/Support'
import Footer from './components/Footer'
import './App.css'

export default function App() {
  return (
    <div className="app">
      <Nav />
      <Hero />
      <Problem />
      <Product />
      <Support />
      <Footer />
    </div>
  )
}
