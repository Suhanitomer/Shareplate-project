import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Truck, Users, UtensilsCrossed } from "lucide-react";
import { toast } from "sonner";

import { api, saveAuthToken } from "@/lib/api";
import { saveUserSession } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type UserRole = "donor" | "recipient" | "volunteer" | null;

const roleRouteMap: Record<Exclude<UserRole, null>, string> = {
  donor: "/donor",
  recipient: "/recipient",
  volunteer: "/volunteer",
};

const Auth = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [isSignUp, setIsSignUp] = useState(searchParams.get("mode") === "signup");
  const [selectedRole, setSelectedRole] = useState<UserRole>("donor");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const navigate = useNavigate();

  useEffect(() => {
    setIsSignUp(searchParams.get("mode") === "signup");
  }, [searchParams]);

  const roles = useMemo(
    () => [
      { id: "donor" as const, label: "Donor", icon: UtensilsCrossed, hint: "Publish surplus food in minutes." },
      { id: "recipient" as const, label: "Recipient", icon: Users, hint: "Claim urgent meals near you." },
      { id: "volunteer" as const, label: "Volunteer", icon: Truck, hint: "Take live delivery assignments." },
    ],
    []
  );

  const handleAuthSuccess = (token: string, user: Awaited<ReturnType<typeof api.getMe>>) => {
    saveAuthToken(token);
    saveUserSession(user);
    navigate(roleRouteMap[user.role || "recipient"] || "/");
  };

  const handleSignup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedRole) {
      toast.error("Choose a role to continue.");
      return;
    }

    setIsSubmitting(true);
    try {
      const [first_name, ...rest] = fullName.trim().split(" ");
      const { token, user } = await api.registerUser({
        email,
        password,
        role: selectedRole,
        first_name,
        last_name: rest.join(" "),
      });
      handleAuthSuccess(token, user);
      toast.success("Account created successfully.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Signup failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogin = async () => {
    setIsSubmitting(true);
    try {
      const { token, user } = await api.loginUser(email, password);
      handleAuthSuccess(token, user);
      toast.success("Logged in successfully.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Login failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleMode = () => {
    const nextMode = isSignUp ? "login" : "signup";
    setSearchParams({ mode: nextMode });
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(34,197,94,0.18),transparent_32%),linear-gradient(180deg,#f6fbf6_0%,#fcf8f1_100%)] px-4 py-10">
      <div className="mx-auto grid min-h-[80vh] max-w-6xl gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="hidden rounded-[2rem] border border-white/60 bg-[#143327] p-10 text-white shadow-[0_24px_80px_rgba(20,51,39,0.28)] lg:flex lg:flex-col lg:justify-between">
          <div className="space-y-6">
            <Link to="/" className="inline-flex items-center gap-3 text-sm uppercase tracking-[0.24em] text-white/72">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10">
                <UtensilsCrossed className="h-6 w-6" />
              </span>
              SharePlate Control Network
            </Link>
            <div className="space-y-4">
              <p className="text-sm uppercase tracking-[0.26em] text-emerald-300">Real-time community logistics</p>
              <h1 className="max-w-xl text-5xl font-semibold leading-tight">
                Coordinate food rescue with live claims, delivery ops, and role-based workspaces.
              </h1>
              <p className="max-w-lg text-lg text-white/74">
                Donors publish inventory, recipients claim nearby meals, and volunteers run live dispatch from one shared network.
              </p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {roles.map((role) => (
              <div key={role.id} className="rounded-3xl border border-white/10 bg-white/8 p-4 backdrop-blur">
                <role.icon className="mb-4 h-6 w-6 text-emerald-300" />
                <h2 className="font-semibold">{role.label}</h2>
                <p className="mt-2 text-sm text-white/70">{role.hint}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="flex items-center">
          <Card className="w-full rounded-[2rem] border-white/70 bg-white/88 shadow-[0_24px_80px_rgba(35,87,55,0.12)] backdrop-blur">
            <CardHeader className="space-y-3 text-center">
              <Link to="/" className="mx-auto flex items-center gap-2">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl gradient-primary">
                  <UtensilsCrossed className="h-6 w-6 text-primary-foreground" />
                </div>
                <span className="text-xl font-semibold">SharePlate</span>
              </Link>
              <CardTitle className="text-3xl">{isSignUp ? "Create your role workspace" : "Continue to your dashboard"}</CardTitle>
              <CardDescription>
                {isSignUp ? "Start as a donor, recipient, or volunteer." : "Log in to view live activity and respond in real time."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {isSignUp ? (
                <form onSubmit={handleSignup} className="space-y-5">
                  <div className="space-y-3">
                    <Label>Select your role</Label>
                    <div className="grid grid-cols-3 gap-3">
                      {roles.map((role) => (
                        <button
                          key={role.id}
                          type="button"
                          onClick={() => setSelectedRole(role.id)}
                          className={`rounded-2xl border p-3 text-left transition ${
                            selectedRole === role.id
                              ? "border-primary bg-primary/10 shadow-card"
                              : "border-border bg-white hover:border-primary/40"
                          }`}
                        >
                          <role.icon className="mb-3 h-5 w-5 text-primary" />
                          <div className="text-sm font-semibold">{role.label}</div>
                          <div className="mt-1 text-xs text-muted-foreground">{role.hint}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="name">Full Name</Label>
                    <Input id="name" value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Aarav Sharma" required />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <Input id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" required />
                  </div>

                  <Button type="submit" variant="hero" size="lg" className="w-full" disabled={isSubmitting}>
                    {isSubmitting ? "Creating workspace..." : "Create account"}
                  </Button>
                </form>
              ) : (
                <div className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="login-email">Email</Label>
                    <Input id="login-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="login-password">Password</Label>
                    <Input id="login-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Your password" />
                  </div>

                  <Button onClick={handleLogin} variant="hero" size="lg" className="w-full" disabled={isSubmitting}>
                    {isSubmitting ? "Authenticating..." : "Login"}
                  </Button>
                </div>
              )}

              <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4 text-sm text-emerald-900">
                Live features included: auto-refreshing dashboards, delivery assignment workflow, network activity metrics, and volunteer location updates.
              </div>

              <div className="text-center text-sm">
                <button onClick={toggleMode} className="font-medium text-primary hover:underline">
                  {isSignUp ? "Already have an account? Login" : "New here? Create an account"}
                </button>
              </div>
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
};

export default Auth;
