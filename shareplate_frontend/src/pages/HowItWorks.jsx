import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Check, Users, HeartHandshake, Utensils, ShieldCheck, UtensilsCrossed } from "lucide-react";
import Navbar from "@/components/Navbar";
import { Link } from "react-router-dom";

const HowItWorks = () => {
  const steps = [
    {
      icon: Utensils,
      title: "1. Donors Post Food",
      description: "Sharing surplus food made simple.",
      features: [
        "Donors list surplus food details",
        "Quantity and freshness are verified",
        "Pickup times are scheduled",
        "Food safety standards maintained"
      ]
    },
    {
      icon: Users,
      title: "2. NGOs Organize",
      description: "Managing logistics offline.",
      features: [
        "NGOs coordinate volunteer pickups",
        "Optimized delivery schedules",
        "Strictly managed by Partner NGOs",
        "Secure and traceable transport"
      ]
    },
    {
      icon: HeartHandshake,
      title: "3. Delivering Hope",
      description: "Feeding those in need.",
      features: [
        "Delivered directly to shelters",
        "Delivery confirmation with photos",
        "Meals distributed to recipients",
        "Full impact tracking"
      ]
    }
  ];

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      {/* Hero Section - Increased padding for clear visibility */}
      <section className="relative pt-20 pb-20 overflow-hidden text-center flex-grow-0">
        <div className="absolute inset-0 gradient-hero opacity-10" />
        <div className="container mx-auto px-4 relative z-10">
          <h1 className="text-4xl md:text-6xl font-bold leading-tight mb-6">
            <br />
            <br />
            How SharePlate <br />
            <span className="gradient-primary bg-clip-text text-transparent">
              Facilitates Change
            </span>
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-10">
            A transparent, verified workflow ensuring surplus food reaches those who need it most.
          </p>
        </div>
      </section>
      <br />
      {/* Steps Grid */}
      <section className="py-10 pb-32 px-4 flex-grow">
        <div className="container mx-auto max-w-6xl">
          <div className="grid md:grid-cols-3 gap-8">
            {steps.map((step, index) => (
              <Card key={index} className="shadow-card hover:shadow-elevated transition-all duration-300 border-2 border-transparent hover:border-primary/50 bg-white">
                <CardHeader>
                  <div className="w-14 h-14 rounded-2xl gradient-primary flex items-center justify-center mb-4">
                    <step.icon className="w-8 h-8 text-primary-foreground" />
                  </div>
                  <CardTitle className="text-2xl">{step.title}</CardTitle>
                  <CardDescription className="text-base">{step.description}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <ul className="space-y-3">
                    {step.features.map((feature, i) => (
                      <li key={i} className="flex items-start gap-3">
                        <span className="text-primary mt-0.5">
                          {feature.includes("Strictly managed") ? <ShieldCheck className="w-5 h-5" /> : <Check className="w-5 h-5" />}
                        </span>
                        <span className={`text-base ${feature.includes("Strictly managed") ? "font-semibold text-primary" : "text-muted-foreground"}`}>
                          {feature}
                        </span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-border mt-auto">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <Link to="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
              <div className="w-8 h-8 rounded-full gradient-primary flex items-center justify-center">
                <UtensilsCrossed className="w-5 h-5 text-primary-foreground" />
              </div>
              <span className="font-bold">SharePlate</span>
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

export default HowItWorks;
