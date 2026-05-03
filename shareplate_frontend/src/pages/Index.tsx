import { Button } from "@/components/ui/button";
import Navbar from "@/components/Navbar";
import RoleCard from "@/components/RoleCard";
import { Users, Package, Truck, UtensilsCrossed } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import heroImage from "@/assets/shareplate.png";
import { useEffect } from "react";

const Index = () => {
  const { hash } = useLocation();

  useEffect(() => {
    if (hash) {
      const element = document.querySelector(hash);
      if (element) {
        element.scrollIntoView({ behavior: "smooth" });
      }
    }
  }, [hash]);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      {/* Hero Section */}
      <section className="relative pt-24 pb-20 overflow-hidden">
        <div className="absolute inset-0 gradient-hero opacity-10" />

        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div className="space-y-6 animate-slide-up">

              <span className="px-4 py-2 bg-primary/10 text-primary rounded-full text-sm">
                🌱 Reducing Food Waste Together
              </span>

              <h1 className="text-5xl md:text-6xl font-bold leading-tight">
                Share a Plate,
                <br />
                <span className="gradient-primary bg-clip-text text-transparent">
                  Change a Life
                </span>
              </h1>

              <p className="text-xl text-muted-foreground">
SharePlate is a community-driven food rescue platform that bridges the gap between surplus and scarcity by connecting food donors with verified NGOs.


              </p>

              <div className="flex flex-col sm:flex-row gap-4">

                {/* JOIN NOW → SIGNUP PAGE */}
                <Button asChild variant="hero" size="lg">
                  <Link to="/auth?mode=signup">Join SharePlate</Link>
                </Button>

                <Button asChild variant="outline" size="lg">
                  <Link to="/how-it-works">Learn More</Link>
                </Button>
              </div>

            </div>

            <div className="relative">
              <div className="absolute inset-0 gradient-primary opacity-20 blur-3xl rounded-full" />
              <img
                src={heroImage}
                className="relative rounded-3xl shadow-elevated w-full animate-float"
                alt="Community sharing food"
              />
            </div>

          </div>
        </div>
      </section>

      {/* Roles Section */}
      <section id="roles" className="py-20">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">Choose Your Role</h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Whether you have food to share...
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-16 max-w-4xl mx-auto">
            <RoleCard
              icon={UtensilsCrossed}
              title="Donor"
              description="Share surplus food"
              features={[
                "Post donations",
                "Pickup times",
                "Track impact",
                "Community connection",
              ]}
              route="/auth?mode=signup&role=donor"
            />

            <RoleCard
              icon={Users}
              title="Recipient"
              description="Access free food"
              features={[
                "Browse donations",
                "Claim items",
                "Notifications",
                "Connect donors",
              ]}
              route="/auth?mode=signup&role=recipient"
            />


          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 gradient-hero">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-4xl font-bold mb-4 text-primary-foreground">
            Ready to Make a Difference?
          </h2>
          <p className="text-xl text-primary-foreground/90 max-w-2xl mx-auto mb-8">
            Join thousands of community members fighting food waste and hunger together.
          </p>
          <Button asChild size="lg" className="bg-card text-foreground hover:bg-card/90">
            <Link to="/auth?mode=signup">Get Started Today</Link>
          </Button>
        </div>
      </section>
      {/* Footer */}
      <footer className="py-12 border-t border-border">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <Link to="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
              <div className="w-8 h-8 rounded-full gradient-primary flex items-center justify-center">
                <UtensilsCrossed className="w-5 h-5 text-primary-foreground" />
              </div>
              <span className="font-bold text-lg">SharePlate</span>
            </Link>
            <p className="text-muted-foreground text-sm">
              © 2025 SharePlate. Fighting food waste, one meal at a time.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;
