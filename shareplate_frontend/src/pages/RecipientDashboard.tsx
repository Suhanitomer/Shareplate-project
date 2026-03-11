import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Navbar from "@/components/Navbar";
import Map from "@/components/Map";
import { Utensils, MapPin, Clock, CheckCircle, LogOut, UtensilsCrossed } from "lucide-react";
import { useNavigate, Link } from "react-router-dom";
import { api, type DonationItem } from "@/lib/api";
import { toast } from "sonner";

const userName = localStorage.getItem("userName") || "User";

const RecipientDashboard = () => {
  const [availableDonations, setAvailableDonations] = useState<DonationItem[]>([]);
  const [myClaims, setMyClaims] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [claimedDonation, setClaimedDonation] = useState<DonationItem | null>(null);

  const navigate = useNavigate();
  const recentClaims = myClaims.slice(0, 3);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [donations, claims] = await Promise.all([
        api.getDonations(),
        api.getRequests()
      ]);
      setAvailableDonations(donations);
      setMyClaims(claims);
    } catch (error) {
      console.error("Failed to fetch data:", error);
      toast.error("Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(); // Initial fetch

    // Auto-refresh data every 10 seconds to show new donations automatically
    const intervalId = setInterval(fetchData, 10000);

    return () => clearInterval(intervalId);
  }, []);

  const handleClaim = async (donation: DonationItem) => {
  try {
    await api.createRequest(donation.id);
    toast.success("Donation claimed successfully!");
    setClaimedDonation(donation);

    // 🔥 Remove claimed item from list immediately
    setAvailableDonations((prev) =>
      prev.filter((item) => item.id !== donation.id)
    );

  } catch (error: any) {
    toast.error(error.message || "Failed to claim donation");
  }
};

  const handleLogout = () => {
    localStorage.clear();
    navigate("/auth");
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Navbar */}
      <div className="flex justify-between items-center bg-white shadow-md px-6 py-4 fixed w-full top-0 z-10">
        <Link to="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
          <div className="w-10 h-10 rounded-full gradient-primary flex items-center justify-center">
            <UtensilsCrossed className="w-6 h-6 text-primary-foreground" />
          </div>
          <span className="text-2xl font-bold">SharePlate</span>
        </Link>
        <Button
          variant="outline"
          onClick={handleLogout}
          className="flex items-center gap-2 border-green-600 text-green-700 hover:bg-green-600 hover:text-white"
        >
          <LogOut className="w-4 h-4" /> Logout
        </Button>
      </div>

      <div className="pt-24 pb-12">
        <div className="container mx-auto px-4">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-4xl font-bold mb-2">Welcome, {userName} 👋</h1>
            <p className="text-muted-foreground text-lg">
              Browse available food donations and claim what you need 🍱
            </p>
          </div>

          {/* Stats */}
          <div className="grid md:grid-cols-3 gap-6 mb-8">
            <Card className="shadow-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Total Claimed
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-primary">
                  {myClaims.length}
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Active Donations
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-secondary">
                  {availableDonations.length}
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Community Impact
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-accent-foreground">⭐ 4.9</div>
              </CardContent>
            </Card>
          </div>

          {/* Available Food List */}
          {claimedDonation && (
            <Card className="shadow-card mb-8" id="claimed-donation-map">
              <CardHeader>
                <CardTitle className="text-green-700">Claimed Successfully</CardTitle>
                <CardDescription>
                  You claimed {claimedDonation.name}. Pickup location is shown below.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {claimedDonation.latitude && claimedDonation.longitude ? (
                  <Map
                    locations={[
                      {
                        lat: claimedDonation.latitude,
                        lng: claimedDonation.longitude,
                        name: claimedDonation.name,
                        title: claimedDonation.name,
                        description: `${claimedDonation.quantity} items • Expires: ${claimedDonation.expiry_date}`,
                        address: claimedDonation.address,
                      },
                    ]}
                    center={[claimedDonation.latitude, claimedDonation.longitude]}
                    zoom={15}
                    height="380px"
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Pickup address: {claimedDonation.address || "Location not available"}
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          <Card className="shadow-card">
            <CardHeader>
              <CardTitle>Available Donations</CardTitle>
              <CardDescription>Click “Claim” to reserve your food items</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {loading ? (
                <p>Loading donations...</p>
              ) : availableDonations.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">No donations available right now.</p>
              ) : (
                availableDonations.map((food) => (
                  <div
                    key={food.id}
                    className="p-4 rounded-lg border-2 border-border hover:border-primary/50 transition-all flex items-center justify-between"
                  >
                    <div className="flex items-center gap-4">
                      <Utensils className="w-6 h-6 text-primary" />
                      <div>
                        <h3 className="font-semibold text-lg">{food.name}</h3>
                        <p className="text-sm text-muted-foreground">
                          {food.quantity} items • Expires: {food.expiry_date}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {food.address}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <Button
                        variant="default"
                        className="bg-green-600 hover:bg-green-700 text-white"
                        onClick={() => handleClaim(food)}
                      >
                        Claim
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Tips Section */}
          <div className="grid md:grid-cols-2 gap-6 mt-8">
            <Card className="shadow-card gradient-primary text-primary-foreground">
              <CardHeader>
                <CardTitle>Quick Tips</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm opacity-90">
                <div className="flex gap-2">
                  <MapPin className="w-4 h-4" />
                  <p>Pick up your claimed food on time to avoid waste.</p>
                </div>
                <div className="flex gap-2">
                  <Clock className="w-4 h-4" />
                  <p>Check expiry dates before claiming any item.</p>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-card">
              <CardHeader>
                <CardTitle>Recent Activity</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                {recentClaims.length === 0 ? (
                  <p>No recent claims yet.</p>
                ) : (
                  recentClaims.map((claim) => (
                    <p key={claim.id}>
                      ✅ Claimed item: {claim.item_details?.name || claim.item_name || claim.item || "Item"}
                    </p>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RecipientDashboard;
