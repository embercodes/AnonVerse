import { ConnectButton } from '@rainbow-me/rainbowkit';
import '../styles/Header.css';

export function Header() {
  return (
    <header className="header">
      <div className="header__brand">
        <div className="header__icon">A</div>
        <div>
          <div className="header__title">AnonVerse</div>
          <div className="header__subtitle">Encrypted group rooms powered by Zama FHE</div>
        </div>
      </div>
      <ConnectButton />
    </header>
  );
}
