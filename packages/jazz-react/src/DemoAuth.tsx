import { ReactNode, useMemo, useState } from "react";
import { BrowserDemoAuth } from "jazz-browser";
import { ReactAuthHook } from "./index.jsx";

export type DemoAuthComponent = (props: {
    appName: string;
    loading: boolean;
    existingUsers: string[];
    logInAs: (existingUser: string) => void;
    signUp: (username: string) => void;
}) => ReactNode;

export function DemoAuth({
    appName,
    appHostname,
    Component = DemoAuthBasicUI,
}: {
    appName: string;
    appHostname?: string;
    Component?: DemoAuthComponent;
}): ReactAuthHook {
    return function useLocalAuth() {
        const [authState, setAuthState] = useState<
            | { state: "loading" }
            | {
                  state: "ready";
                  existingUsers: string[];
                  logInAs: (existingUser: string) => void;
                  signUp: (username: string) => void;
              }
            | { state: "signedIn"; logOut: () => void }
        >({ state: "loading" });

        const [logOutCounter, setLogOutCounter] = useState(0);

        const auth = useMemo(() => {
            return new BrowserDemoAuth(
                {
                    onReady(next) {
                        setAuthState({
                            state: "ready",
                            existingUsers: next.existingUsers,
                            logInAs: next.logInAs,
                            signUp: next.signUp,
                        });
                    },
                    onSignedIn(next) {
                        setAuthState({
                            state: "signedIn",
                            logOut: () => {
                                next.logOut();
                                setAuthState({ state: "loading" });
                                setLogOutCounter((c) => c + 1);
                            },
                        });
                    },
                },
                appName
            );
        }, [appName, appHostname, logOutCounter]);

        const AuthUI =
            authState.state === "ready"
                ? Component({
                      appName,
                      loading: false,
                      existingUsers: authState.existingUsers,
                      logInAs: authState.logInAs,
                      signUp: authState.signUp,
                  })
                : Component({
                      appName,
                      loading: false,
                      existingUsers: [],
                      logInAs: () => {},
                      signUp: (_) => {},
                  });

        return {
            auth,
            AuthUI,
            logOut:
                authState.state === "signedIn" ? authState.logOut : undefined,
        };
    };
}

export const DemoAuthBasicUI = ({
    appName,
    existingUsers,
    logInAs,
    signUp,
}: {
    appName: string;
    existingUsers: string[];
    logInAs: (existingUser: string) => void;
    signUp: (username: string) => void;
}) => {
    const [username, setUsername] = useState<string>("");
    const darkMode = window.matchMedia("(prefers-color-scheme: dark)").matches;

    return (
        <div
            style={{
                width: "100vw",
                height: "100vh",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                ...(darkMode ? { background: "#000" } : {}),
            }}
        >
            <div
                style={{
                    width: "18rem",
                    display: "flex",
                    flexDirection: "column",
                    gap: "2rem",
                }}
            >
                <h1 style={{ color: darkMode ? "#fff" : "#000", textAlign: "center" }}>{appName}</h1>
                <form
                    style={{
                        width: "18rem",
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.5rem",
                    }}
                    onSubmit={(e) => {
                        e.preventDefault();
                        signUp(username);
                    }}
                >
                    <input
                        placeholder="Display name"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        autoComplete="webauthn"
                        style={{
                            border: darkMode
                                ? "2px solid #444"
                                : "2px solid #ddd",
                            padding: "11px 8px",
                            borderRadius: "6px",
                            background: darkMode ? "#000" : "#fff",
                            color: darkMode ? "#fff" : "#000",
                        }}
                    />
                    <input
                        type="submit"
                        value="Sign Up as new account"
                        style={{
                            padding: "13px 5px",
                            border: "none",
                            borderRadius: "6px",
                            cursor: "pointer",
                            background: darkMode ? "#444" : "#ddd",
                            color: darkMode ? "#fff" : "#000",
                        }}
                    />
                </form>
                <div
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.5rem",
                    }}
                >
                    {existingUsers.map((user) => (
                        <button
                            key={user}
                            onClick={() => logInAs(user)}
                            style={{
                                background: darkMode ? "#222" : "#eee",
                                color: darkMode ? "#fff" : "#000",
                                padding: "13px 5px",
                                border: "none",
                                borderRadius: "6px",
                                cursor: "pointer",
                            }}
                        >
                            Log In as "{user}"
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
};
