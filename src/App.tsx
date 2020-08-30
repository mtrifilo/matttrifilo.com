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
          <section className="app_headerSection">
            <header className="app_header">
              <h1>Matt Trifilo</h1>
            </header>

            <nav className="app_nav">
              {/* <a>Software</a>

              <a>Photography</a> */}

              <a href="https://blog.matttrifilo.com">Blog</a>

              <a href="https://www.linkedin.com/in/matttrifilo/">Linkedin</a>
            </nav>
          </section>

          <section className="app_contentSection">
            <div className="app_aboutContent">
              <h2>👋 I'm Matt</h2>

              <p>I make things with Java, JavaScript, and occasionally Go.</p>

              <p>
                When I'm not wrangling code, I enjoy music, photography,
                writing, and the outdoors.
              </p>
            </div>
          </section>
        </div>
      </>
    );
  }
}

export default App;
