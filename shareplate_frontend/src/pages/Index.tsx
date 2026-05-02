import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { Activity, ArrowRight, Package, Truck, Users, UtensilsCrossed } from "lucide-react";

import Navbar from "@/components/Navbar";
import RoleCard from "@/components/RoleCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import heroImage from "@/assets/shareplate.png";

const Index = () => {
  const { hash } = useLocation();

  useEffect(() => {
    if (!hash) {
      return;
    }
    const element = document.querySelector(hash);
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
  }, [hash]);

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f6fbf6_0%,#fbf6ef_100%)] text-foreground">
      <Navbar />

      <section className="relative overflow-hidden px-4 pb-20 pt-28">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,197,94,0.18),transparent_28%),radial-gradient(circle_at_80%_20%,rgba(59,130,246,0.14),transparent_24%)]" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-7">
            <Badge className="rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-emerald-700 hover:bg-emerald-50">
              Advanced food rescue platform
            </Badge>
            <div className="space-y-5">
              <h1 className="max-w-3xl text-5xl font-semibold leading-tight md:text-6xl">
                Real-time coordination for surplus food, urgent need, and last-mile delivery.
              </h1>
              <p className="max-w-2xl text-lg text-muted-foreground md:text-xl">
                SharePlate now runs like an operations network: live claims, volunteer dispatch, delivery status tracking, and role-based dashboards for every participant.
              </p>
            </div>
            <div className="flex flex-col gap-4 sm:flex-row">
              <Button asChild variant="hero" size="lg">
                <Link to="/auth?mode=signup">
                  Launch your workspace
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link to="/how-it-works">Explore the workflow</Link>
              </Button>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-3xl border border-white/60 bg-white/80 p-5 shadow-soft">
                <Activity className="mb-3 h-5 w-5 text-primary" />
                <p className="text-sm text-muted-foreground">Live refresh</p>
                <p className="mt-1 text-2xl font-semibold">5s to 15s</p>
              </div>
              <div className="rounded-3xl border border-white/60 bg-white/80 p-5 shadow-soft">
                <Truck className="mb-3 h-5 w-5 text-primary" />
                <p className="text-sm text-muted-foreground">Dispatch-ready</p>
                <p className="mt-1 text-2xl font-semibold">Volunteer ops</p>
              </div>
              <div className="rounded-3xl border border-white/60 bg-white/80 p-5 shadow-soft">
                <Package className="mb-3 h-5 w-5 text-primary" />
                <p className="text-sm text-muted-foreground">Full lifecycle</p>
                <p className="mt-1 text-2xl font-semibold">Claim to delivery</p>
              </div>
            </div>
          </div>

          <div className="relative">
            <div className="absolute -inset-8 rounded-[3rem] bg-[linear-gradient(135deg,rgba(34,197,94,0.20),rgba(59,130,246,0.16))] blur-3xl" />
            <div className="relative overflow-hidden rounded-[2.5rem] border border-white/70 bg-[#143327] p-5 shadow-[0_28px_90px_rgba(20,51,39,0.24)]">
              <img src={heroImage} className="h-[420px] w-full rounded-[2rem] object-cover" alt="Community sharing food" />
              <div className="absolute bottom-10 left-10 right-10 grid gap-4 md:grid-cols-2">
                <div className="rounded-3xl border border-white/10 bg-white/10 p-5 text-white backdrop-blur">
                  <p className="text-xs uppercase tracking-[0.22em] text-emerald-200">Donor view</p>
                  <p className="mt-2 text-xl font-semibold">Publish inventory instantly</p>
                </div>
                <div className="rounded-3xl border border-white/10 bg-white/10 p-5 text-white backdrop-blur">
                  <p className="text-xs uppercase tracking-[0.22em] text-sky-200">Volunteer view</p>
                  <p className="mt-2 text-xl font-semibold">Claim live dispatches</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="roles" className="px-4 py-20">
        <div className="mx-auto max-w-7xl">
          <div className="mb-14 max-w-3xl">
            <p className="text-sm uppercase tracking-[0.24em] text-primary">Role-based command center</p>
            <h2 className="mt-3 text-4xl font-semibold">Every role gets a live workspace built for its job.</h2>
          </div>

          <div className="grid gap-8 lg:grid-cols-3">
            <RoleCard
              icon={UtensilsCrossed}
              title="Donor"
              description="Post surplus food and monitor downstream activity."
              features={["Live request feed", "Inventory map", "Impact metrics", "Fast publishing workflow"]}
              route="/auth?mode=signup"
            />
            <RoleCard
              icon={Users}
              title="Recipient"
              description="Claim nearby meals and watch delivery progress update live."
              features={["Urgency markers", "Auto-refreshing feed", "Claim history", "Delivery tracking"]}
              route="/auth?mode=signup"
            />
            <RoleCard
              icon={Truck}
              title="Volunteer"
              description="Run a dispatch board with assignment and route awareness."
              features={["Open delivery queue", "Status milestones", "Live browser location", "Operations map"]}
              route="/auth?mode=signup"
            />
          </div>
        </div>
      </section>

      <section className="px-4 pb-20">
        <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="rounded-[2rem] bg-[#123524] p-8 text-white shadow-[0_28px_80px_rgba(18,53,36,0.22)]">
            <p className="text-sm uppercase tracking-[0.24em] text-emerald-300">Operational upgrades</p>
            <h3 className="mt-4 text-3xl font-semibold">What changed in this version</h3>
            <div className="mt-8 space-y-4 text-white/78">
              <p>Role-protected dashboards keep each workspace focused and safer.</p>
              <p>Claims and deliveries now have a richer status lifecycle for real operational tracking.</p>
              <p>Volunteer workflows support live assignment and in-browser location updates.</p>
            </div>
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="rounded-[2rem] border border-white/70 bg-white/90 p-6 shadow-soft">
              <p className="text-sm uppercase tracking-[0.24em] text-primary">API depth</p>
              <h3 className="mt-3 text-2xl font-semibold">Cleaner contracts</h3>
              <p className="mt-3 text-muted-foreground">
                The frontend now reads consistent user, donation, request, and summary payloads instead of mixing local fallbacks and partial responses.
              </p>
            </div>
            <div className="rounded-[2rem] border border-white/70 bg-white/90 p-6 shadow-soft">
              <p className="text-sm uppercase tracking-[0.24em] text-primary">Live UX</p>
              <h3 className="mt-3 text-2xl font-semibold">Auto-refreshing operations</h3>
              <p className="mt-3 text-muted-foreground">
                React Query keeps the network current, making the app feel active without full-page reloads.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Index;
