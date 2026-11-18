import logoUrl from '../assets/logo.svg'

export default function Splash({ fading }: { fading: boolean }): React.JSX.Element {
  return (
    <div className={`splash${fading ? ' fade' : ''}`}>
      <img className="splash-logo" src={logoUrl} alt="GitScylla" />
      <div className="splash-tag">a git client with teeth</div>
    </div>
  )
}
