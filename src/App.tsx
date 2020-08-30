import * as React from "react";
import "./app.css";

interface Props {
  name: string;
}

class App extends React.Component<Props> {
  render() {
    // const { name } = this.props;
    return (
      <>
        <div className="app_layout">
          <header className="app_header">
            <h1>Matt Trifilo</h1>
          </header>

          <nav className="app_nav">
            <a>Software</a>

            <a>Photography</a>

            <a>Blog</a>

            <a>Linkedin</a>
          </nav>
        </div>
      </>
    );
  }
}

export default App;
