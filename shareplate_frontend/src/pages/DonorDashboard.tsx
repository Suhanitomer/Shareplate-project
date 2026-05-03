import { FormEvent, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, Clock3, LogOut, MapPin, Package2, Pencil, PlusCircle, Trash2, Truck } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

import { api, type DonationItem } from "@/lib/api";
import { geocodeAddress } from "@/lib/geocoding";
import { clearUserSession, getStoredUser } from "@/lib/session";
import LiveBadge from "@/components/LiveBadge";
import Map from "@/components/Map";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

const ACTIVE_DONATION_WINDOW_MS = 72 * 60 * 60 * 1000;

const DonorDashboard = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = getStoredUser();
  const [form, setForm] = useState({
    name: "",
    description: "",
    quantity: 1,
    expiry_date: "",
    address: "",
  });
  const [editingDonation, setEditingDonation] = useState<DonationItem | null>(null);

  const donationsQuery = useQuery({
    queryKey: ["donations", "mine"],
    queryFn: () => api.getDonations({ mine: true }),
    refetchInterval: 5000,
  });

  const requestsQuery = useQuery({
    queryKey: ["requests", "donor"],
    queryFn: () => api.getRequests(),
    refetchInterval: 4000,
  });

  const summaryQuery = useQuery({
    queryKey: ["dashboard-summary", "donor"],
    queryFn: api.getDashboardSummary,
    refetchInterval: 10000,
  });

  const createDonationMutation = useMutation({
    mutationFn: async (payload: typeof form) => {
      try {
        const geocoded = await geocodeAddress(payload.address);
        const donationPayload = {
          ...payload,
          latitude: geocoded.lat,
          longitude: geocoded.lng,
        };
        return editingDonation
          ? api.updateDonation(editingDonation.id, donationPayload)
          : api.createDonation(donationPayload);
      } catch {
        return editingDonation ? api.updateDonation(editingDonation.id, payload) : api.createDonation(payload);
      }
    },
    onSuccess: () => {
      toast.success(editingDonation ? "Donation updated." : "Donation published to the live network.");
      setForm({ name: "", description: "", quantity: 1, expiry_date: "", address: "" });
      setEditingDonation(null);
      queryClient.invalidateQueries({ queryKey: ["donations"] });
      queryClient.invalidateQueries({ queryKey: ["requests"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteDonationMutation = useMutation({
    mutationFn: api.deleteDonation,
    onSuccess: () => {
      toast.success("Donation deleted.");
      if (editingDonation) {
        setEditingDonation(null);
        setForm({ name: "", description: "", quantity: 1, expiry_date: "", address: "" });
      }
      queryClient.invalidateQueries({ queryKey: ["donations"] });
      queryClient.invalidateQueries({ queryKey: ["requests"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const recentDonationsFeed = useMemo(
    () =>
      (donationsQuery.data || []).filter((item) => {
        const createdAtMs = new Date(item.created_at).getTime();
        if (!Number.isFinite(createdAtMs)) {
          return false;
        }
        return Date.now() - createdAtMs <= ACTIVE_DONATION_WINDOW_MS;
      }),
    [donationsQuery.data]
  );

  const liveLocations = useMemo(
    () =>
      recentDonationsFeed
        .filter((item) => item.latitude && item.longitude)
        .map((item) => ({
          lat: item.latitude,
          lng: item.longitude,
          title: item.name,
          description: `${item.quantity} portions`,
          address: item.address,
        })),
    [recentDonationsFeed]
  );

  const activeRequests = useMemo(
    () =>
      [...(requestsQuery.data || [])].sort(
        (left, right) => new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime()
      ),
    [requestsQuery.data]
  );
  const recentDonations = useMemo(
    () =>
      [...recentDonationsFeed]
        .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime())
        .slice(0, 2),
    [recentDonationsFeed]
  );
  const allPostedDonations = useMemo(
    () =>
      [...(donationsQuery.data || [])].sort(
        (left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime()
      ),
    [donationsQuery.data]
  );
  const recentRequests = activeRequests.slice(0, 2);
  const summary = summaryQuery.data;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    createDonationMutation.mutate(form);
  };

  const handleEditDonation = (item: DonationItem) => {
    setEditingDonation(item);
    setForm({
      name: item.name,
      description: item.description || "",
      quantity: item.quantity,
      expiry_date: item.expiry_date,
      address: item.address,
    });
  };

  const handleResetForm = () => {
    setEditingDonation(null);
    setForm({ name: "", description: "", quantity: 1, expiry_date: "", address: "" });
  };

  const handleCancelDonation = (itemId: number) => {
    if (!window.confirm("Delete this donation?")) {
      return;
    }
    deleteDonationMutation.mutate(itemId);
  };

  const logout = () => {
    clearUserSession();
    navigate("/auth?mode=login");
  };

  return (
    <div className="min-h-screen bg-[#f7f6f2]">
      <header className="sticky top-0 z-20 border-b border-white/70 bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
          <Link to="/" className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl gradient-primary">
              <Package2 className="h-6 w-6 text-primary-foreground" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Donor control room</p>
              <p className="text-lg font-semibold">SharePlate</p>
            </div>
          </Link>
          <div className="flex items-center gap-3">
            <LiveBadge />
            <Button variant="outline" onClick={logout}>
              <LogOut className="mr-2 h-4 w-4" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-8 px-4 py-8">
        <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <Card className="border-border bg-[#18392b] text-white shadow-sm">
            <CardContent className="grid gap-6 p-8 lg:grid-cols-[1fr_auto]">
              <div className="space-y-4">
                <h1 className="text-4xl font-semibold">Welcome back, {user?.first_name || "Donor"}.</h1>
                <p className="max-w-2xl text-white/80">
                  Post food, follow claim activity, and cancel donations if pickup is no longer possible.
                </p>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="text-sm text-white/70">Active donations</div>
                    <div className="mt-2 text-3xl font-semibold">{Number(summary?.active_donations || 0)}</div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="text-sm text-white/70">Total claims</div>
                    <div className="mt-2 text-3xl font-semibold">{Number(summary?.total_requests || 0)}</div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="text-sm text-white/70">Delivered</div>
                    <div className="mt-2 text-3xl font-semibold">{Number(summary?.delivered_requests || 0)}</div>
                  </div>
                </div>
              </div>
              <div className="self-start rounded-2xl bg-white/10 p-5">
                <p className="text-sm text-white/70">Network activity</p>
                <p className="mt-2 text-3xl font-semibold">{Number(summary?.network?.active_deliveries || 0)}</p>
                <p className="mt-1 text-sm text-white/75">Deliveries currently in motion.</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-white/70 bg-white/88">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <PlusCircle className="h-5 w-5 text-primary" />
                {editingDonation ? "Edit donation" : "Publish a donation"}
              </CardTitle>
              <CardDescription>
                {editingDonation ? "Update the donation details below." : "New donations appear immediately in the live feed."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Food title</Label>
                  <Input id="name" value={form.name} onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="quantity">Quantity</Label>
                  <Input id="quantity" type="number" min={1} value={form.quantity} onChange={(e) => setForm((current) => ({ ...current, quantity: Number(e.target.value) }))} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="expiry">Expiry date</Label>
                  <Input id="expiry" type="date" value={form.expiry_date} onChange={(e) => setForm((current) => ({ ...current, expiry_date: e.target.value }))} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="address">Pickup address</Label>
                  <Input id="address" value={form.address} onChange={(e) => setForm((current) => ({ ...current, address: e.target.value }))} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea id="description" value={form.description} onChange={(e) => setForm((current) => ({ ...current, description: e.target.value }))} rows={4} />
                </div>
                <div className="flex gap-3">
                  <Button type="submit" variant="hero" className="flex-1" disabled={createDonationMutation.isPending}>
                    {createDonationMutation.isPending
                      ? editingDonation
                        ? "Saving..."
                        : "Publishing..."
                      : editingDonation
                        ? "Save changes"
                        : "Publish donation"}
                  </Button>
                  {editingDonation && (
                    <Button type="button" variant="outline" onClick={handleResetForm}>
                      Cancel
                    </Button>
                  )}
                </div>
              </form>

              <div className="mt-6 rounded-2xl bg-muted/40 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-foreground">Latest posted donations</p>
                  <span className="text-xs text-muted-foreground">New posts appear here right away.</span>
                </div>
                <div className="space-y-3">
                  {recentDonations.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Your newest donations will appear here.</p>
                  ) : (
                    recentDonations.map((item) => (
                      <div key={item.id} className="flex items-center justify-between rounded-2xl bg-white px-4 py-3">
                        <div>
                          <p className="font-medium">{item.name}</p>
                          <p className="text-sm text-muted-foreground">{item.address}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">Available</Badge>
                          <Button type="button" variant="outline" size="sm" onClick={() => handleEditDonation(item)}>
                            <Pencil className="mr-1 h-4 w-4" />
                            Edit
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleCancelDonation(item.id)}
                            disabled={deleteDonationMutation.isPending}
                          >
                            <Trash2 className="mr-1 h-4 w-4" />
                            Delete
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <Card className="border-white/70 bg-white/90">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-primary" />
                Request activity feed
              </CardTitle>
              <CardDescription>Claims and deliveries refresh automatically.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {activeRequests.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-border p-6 text-center text-muted-foreground">
                  No request activity yet. Publish a donation to start the workflow.
                </p>
              ) : (
                recentRequests.map((request) => (
                  <div key={request.id} className="rounded-3xl border border-border/80 bg-background/80 p-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <p className="text-lg font-semibold">{request.item_details.name}</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Claimed by {request.requester?.full_name || request.requester?.email || "Recipient"}
                        </p>
                      </div>
                      <Badge variant={request.delivery_status === "delivered" ? "secondary" : "outline"}>
                        {request.delivery_status.replace("_", " ")}
                      </Badge>
                    </div>
                    <div className="mt-4 grid gap-3 text-sm text-muted-foreground sm:grid-cols-3">
                      <div className="flex items-center gap-2">
                        <Package2 className="h-4 w-4 text-primary" />
                        {request.item_details.quantity} portions
                      </div>
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-primary" />
                        {request.item_details.address}
                      </div>
                      <div className="flex items-center gap-2">
                        <Clock3 className="h-4 w-4 text-primary" />
                        {formatDistanceToNow(new Date(request.updated_at), { addSuffix: true })}
                      </div>
                    </div>
                    {request.volunteer && (
                      <div className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                        Volunteer assigned: {request.volunteer.full_name}
                      </div>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card className="border-white/70 bg-white/90">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Truck className="h-5 w-5 text-primary" />
                  Pickup map
                </CardTitle>
                <CardDescription>Pickup locations for your current donations.</CardDescription>
              </CardHeader>
              <CardContent>
                {liveLocations.length > 0 ? (
                  <Map locations={liveLocations} height="340px" />
                ) : (
                  <p className="rounded-2xl border border-dashed border-border p-8 text-center text-muted-foreground">
                    Publish a donation with an address to populate the live map.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card className="border-white/70 bg-white/90">
              <CardHeader>
                <CardTitle>Your donations</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {allPostedDonations.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No donations published yet.</p>
                ) : (
                  allPostedDonations.map((item) => (
                    <div key={item.id} className="flex items-center justify-between rounded-2xl bg-muted/60 px-4 py-3">
                      <div>
                        <p className="font-medium">{item.name}</p>
                        <p className="text-sm text-muted-foreground">{item.address}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">Available</Badge>
                        <Button type="button" variant="outline" size="sm" onClick={() => handleEditDonation(item)}>
                          <Pencil className="mr-1 h-4 w-4" />
                          Edit
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleCancelDonation(item.id)}
                          disabled={deleteDonationMutation.isPending}
                        >
                          <Trash2 className="mr-1 h-4 w-4" />
                          Delete
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </section>
      </main>
    </div>
  );
};

export default DonorDashboard;
