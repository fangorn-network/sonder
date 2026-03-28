import { usePrivy } from '@privy-io/react-auth'

export function ConnectWallet() {
  const { login, logout, authenticated, user } = usePrivy()

  if (authenticated) {
    const label =
      user?.email?.address ??
      (user as any)?.google?.email ??
      `${user?.wallet?.address?.slice(0, 6)}...${user?.wallet?.address?.slice(-4)}`
    return (
      <div className="wallet-chip connected">
        <span className="wallet-dot" />
        <span className="wallet-label">{label}</span>
        <button className="wallet-logout" onClick={logout}>✕</button>
      </div>
    )
  }

  return (
    <button className="btn-connect" onClick={login}>
      Connect
    </button>
  )
}