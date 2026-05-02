import { FormEvent, useDeferredValue, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  LogOut,
  MapPin,
  Package,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Truck,
  Users,
  PlusCircle,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

import { api, type DeliveryRequest, type DonationItem } from "@/lib/api";
import { geocodeAddress } from "@/lib/geocoding";
import { clearUserSession, getStoredUser } from "@/lib/session";
import LiveBadge from "@/components/LiveBadge";
import Map from "@/components/Map";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type FilterKey = "all" | "urgent" | "fresh" | "bulk";
type WorkspaceMode = "rescue" | "donate";
const STALE_ACTIVE_CLAIM_WINDOW_MS = 6 * 60 * 60 * 1000;

const filters: Array<{ key: FilterKey; label: string }> = [
  { key: "all", label: "All meals" },
  { key: "urgent", label: "Ready now" },
  { key: "fresh", label: "Fresh picks" },
  { key: "bulk", label: "Family packs" },
];

const deliveryStepMeta: Array<{
  key: DeliveryRequest["delivery_status"];
  label: string;
  shortLabel: string;
  icon: typeof Package;
}> = [
  { key: "pending", label: "Claim confirmed", shortLabel: "Claimed", icon: CheckCircle2 },
  { key: "assigned", label: "Volunteer assigned", shortLabel: "Assigned", icon: Users },
  { key: "picked", label: "Picked up", shortLabel: "Picked", icon: Package },
  { key: "delivering", label: "On the way", shortLabel: "On route", icon: Truck },
  { key: "delivered", label: "Delivered", shortLabel: "Delivered", icon: CheckCircle2 },
];

const deliveryProgress: Record<DeliveryRequest["delivery_status"], number> = {
  pending: 15,
  assigned: 35,
  picked: 60,
  delivering: 82,
  delivered: 100,
};

const urgencyTone: Record<string, string> = {
  expired: "bg-rose-50 text-rose-700 border-rose-200",
  today: "bg-orange-50 text-orange-700 border-orange-200",
  urgent: "bg-amber-50 text-amber-700 border-amber-200",
  fresh: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

const computePriorityScore = (donation: DonationItem) => {
  let score = 0;
  if (donation.expiry_status === "today") score += 6;
  if (donation.expiry_status === "urgent") score += 4;
  if (donation.expiry_status === "fresh") score += 2;
  if (donation.quantity >= 5) score += 3;
  if (donation.description) score += 1;
  return score;
};

const getEtaLabel = (request: DeliveryRequest) => {
  switch (request.delivery_status) {
    case "pending":
      return "Waiting for volunteer";
    case "assigned":
      return "Volunteer joining soon";
    case "picked":
      return "Pickup completed";
    case "delivering":
      return "Arriving shortly";
    case "delivered":
      return "Completed";
    default:
      return "Live update pending";
  }
};

const getCurrentPosition = () =>
  new Promise<{ latitude: number; longitude: number } | null>((resolve) => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        }),
      () => resolve(null),
      { enableHighAccuracy: true, maximumAge: 60000, timeout: 12000 }
    );
  });

const resolveDonationCoordinates = async (donation: DonationItem) => {
  if (Number.isFinite(donation.latitude) && Number.isFinite(donation.longitude)) {
    return {
      lat: donation.latitude!,
      lng: donation.longitude!,
    };
  }

  if (!donation.address) {
    return null;
  }

  try {
    const result = await geocodeAddress(donation.address);
    return { lat: result.lat, lng: result.lng };
  } catch {
    return null;
  }
};

const DonationHeroCard = ({
  donation,
  onClaim,
  disabled,
}: {
  donation: DonationItem;
  onClaim: (donation: DonationItem) => void;
  disabled: boolean;
}) => (
  <div className="overflow-hidden rounded-[2rem] bg-[linear-gradient(135deg,#ff6b35_0%,#ff8f3f_58%,#ffbe5c_100%)] p-[1px] shadow-[0_24px_70px_rgba(255,107,53,0.28)]">
    <div className="rounded-[calc(2rem-1px)] bg-[linear-gradient(135deg,rgba(255,255,255,0.16),rgba(255,255,255,0.04))] p-6 text-white backdrop-blur">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-3">
          <Badge className="border-white/15 bg-white/15 text-white hover:bg-white/15">Best match for you</Badge>
          <div>
            <h2 className="text-3xl font-semibold">{donation.name}</h2>
            <p className="mt-2 max-w-xl text-sm text-white/82">
              {donation.description || "A high-priority community meal ready for fast pickup and quick delivery."}
            </p>
          </div>
        </div>
        <div className="rounded-3xl bg-black/12 px-4 py-3 text-right">
          <div className="text-xs uppercase tracking-[0.2em] text-white/70">Smart score</div>
          <div className="mt-1 text-3xl font-semibold">{computePriorityScore(donation) + 90}</div>
        </div>
      </div>

      <div className="mt-6 grid gap-3 md:grid-cols-3">
        <div className="rounded-3xl border border-white/12 bg-white/10 px-4 py-3">
          <div className="text-xs uppercase tracking-[0.2em] text-white/65">Ready in</div>
          <div className="mt-2 text-lg font-semibold">12-18 min</div>
        </div>
        <div className="rounded-3xl border border-white/12 bg-white/10 px-4 py-3">
          <div className="text-xs uppercase tracking-[0.2em] text-white/65">Portions</div>
          <div className="mt-2 text-lg font-semibold">{donation.quantity} meals</div>
        </div>
        <div className="rounded-3xl border border-white/12 bg-white/10 px-4 py-3">
          <div className="text-xs uppercase tracking-[0.2em] text-white/65">Expiry</div>
          <div className="mt-2 text-lg font-semibold">{donation.expiry_status || "fresh"}</div>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm text-white/86">
            <MapPin className="h-4 w-4" />
            {donation.address}
          </div>
          <div className="flex items-center gap-2 text-sm text-white/72">
            <ShieldCheck className="h-4 w-4" />
            Verified listing with live availability sync
          </div>
        </div>
        <Button
          className="h-12 rounded-2xl bg-white px-6 text-base font-semibold text-[#f05a28] hover:bg-white/90"
          onClick={() => onClaim(donation)}
          disabled={disabled}
        >
          Claim now
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  </div>
);

const RecipientDashboard = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = getStoredUser();
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<FilterKey>("all");
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("rescue");
  const deferredSearch = useDeferredValue(search);
  const [donationForm, setDonationForm] = useState({
    name: "",
    description: "",
    quantity: 1,
    expiry_date: "",
    address: "",
  });
  const [claimPickupLocation, setClaimPickupLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [geocodedPickupPoint, setGeocodedPickupPoint] = useState<{ lat: number; lng: number } | null>(null);
  const [claimedRequestPreview, setClaimedRequestPreview] = useState<DeliveryRequest | null>(null);
  const [claimRecipientLocation, setClaimRecipientLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [claimedDonationPreview, setClaimedDonationPreview] = useState<DonationItem | null>(null);

  const donationsQuery = useQuery({
    queryKey: ["donations", "public"],
    queryFn: () => api.getDonations(),
    refetchInterval: 4000,
  });

  const requestsQuery = useQuery({
    queryKey: ["requests", "recipient"],
    queryFn: () => api.getRequests(),
    refetchInterval: 4000,
  });

  const summaryQuery = useQuery({
    queryKey: ["dashboard-summary", "recipient"],
    queryFn: api.getDashboardSummary,
    refetchInterval: 10000,
  });

  const claimMutation = useMutation({
    onMutate: (donation: DonationItem) => {
      setClaimedDonationPreview(donation);
      setClaimPickupLocation(
        Number.isFinite(donation.latitude) && Number.isFinite(donation.longitude)
          ? { lat: donation.latitude!, lng: donation.longitude! }
          : null
      );
      return { donation };
    },
    mutationFn: async (donation: DonationItem) => {
      const [recipientLocation, pickupLocation] = await Promise.all([
        getCurrentPosition(),
        resolveDonationCoordinates(donation),
      ]);
      setClaimPickupLocation(pickupLocation);
      setClaimRecipientLocation(recipientLocation);
      return api.createRequest(donation.id, {
        recipient_latitude: recipientLocation?.latitude,
        recipient_longitude: recipientLocation?.longitude,
      });
    },
    onSuccess: (request, donation) => {
      setClaimedRequestPreview({
        ...request,
        item_details: donation
          ? {
              ...request.item_details,
              ...donation,
            }
          : request.item_details,
      });
      toast.success("Donation claimed. Live delivery tracking is now active.");
      queryClient.invalidateQueries({ queryKey: ["donations"] });
      queryClient.invalidateQueries({ queryKey: ["requests"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
    },
    onError: (error: Error) => {
      setClaimedDonationPreview(null);
      setClaimPickupLocation(null);
      toast.error(error.message);
    },
  });

  const createDonationMutation = useMutation({
    mutationFn: api.createDonation,
    onSuccess: () => {
      setClaimedRequestPreview(null);
      setClaimedDonationPreview(null);
      setClaimPickupLocation(null);
      toast.success("Donation posted successfully. It is now live in the rescue feed.");
      setDonationForm({
        name: "",
        description: "",
        quantity: 1,
        expiry_date: "",
        address: "",
      });
      setWorkspaceMode("rescue");
      queryClient.invalidateQueries({ queryKey: ["donations"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const logout = () => {
    clearUserSession();
    navigate("/auth?mode=login");
  };

  const availableDonations = donationsQuery.data || [];
  const myClaims = useMemo(
    () =>
      [...(requestsQuery.data || [])].sort(
        (left, right) => new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime()
      ),
    [requestsQuery.data]
  );
  const activeClaims = myClaims.filter((claim) => {
    if (claim.delivery_status === "delivered") {
      return false;
    }
    const updatedAtMs = new Date(claim.updated_at).getTime();
    if (!Number.isFinite(updatedAtMs)) {
      return true;
    }
    return Date.now() - updatedAtMs <= STALE_ACTIVE_CLAIM_WINDOW_MS;
  });
  const latestClaim = useMemo(() => {
    if (!claimedRequestPreview || claimedRequestPreview.delivery_status === "delivered") {
      return activeClaims[0] || null;
    }

    // Always prefer server state when it exists for the same request id.
    const serverVersion = myClaims.find((claim) => claim.id === claimedRequestPreview.id);
    if (serverVersion) {
      return serverVersion.delivery_status === "delivered" ? null : serverVersion;
    }

    // Keep local preview only until backend list catches up.
    return claimedRequestPreview;
  }, [claimedRequestPreview, myClaims, activeClaims]);
  const summary = summaryQuery.data;

  useEffect(() => {
    let cancelled = false;

    const resolvePickupCoordinates = async () => {
      if (!latestClaim?.item_details?.address) {
        setGeocodedPickupPoint(null);
        return;
      }

      if (
        Number.isFinite(latestClaim.item_details.latitude) &&
        Number.isFinite(latestClaim.item_details.longitude)
      ) {
        setGeocodedPickupPoint(null);
        return;
      }

      try {
        const result = await geocodeAddress(latestClaim.item_details.address);
        if (!cancelled) {
          setGeocodedPickupPoint({ lat: result.lat, lng: result.lng });
        }
      } catch {
        if (!cancelled) {
          setGeocodedPickupPoint(null);
        }
      }
    };

    resolvePickupCoordinates();

    return () => {
      cancelled = true;
    };
  }, [latestClaim?.id, latestClaim?.item_details?.address, latestClaim?.item_details?.latitude, latestClaim?.item_details?.longitude]);

  useEffect(() => {
    const serverVersion = claimedRequestPreview
      ? myClaims.find((claim) => claim.id === claimedRequestPreview.id)
      : null;
    const isDelivered =
      claimedRequestPreview?.delivery_status === "delivered" ||
      serverVersion?.delivery_status === "delivered";
    if (isDelivered) {
      setClaimedRequestPreview(null);
      setClaimedDonationPreview(null);
      setClaimPickupLocation(null);
      setGeocodedPickupPoint(null);
    }
  }, [claimedRequestPreview, myClaims]);

  const trackingMapData = useMemo(() => {
    const pickupLat = Number.isFinite(latestClaim?.item_details?.latitude)
      ? latestClaim?.item_details?.latitude
      : Number.isFinite(claimedDonationPreview?.latitude)
        ? claimedDonationPreview?.latitude
        : claimPickupLocation?.lat ?? geocodedPickupPoint?.lat;
    const pickupLng = Number.isFinite(latestClaim?.item_details?.longitude)
      ? latestClaim?.item_details?.longitude
      : Number.isFinite(claimedDonationPreview?.longitude)
        ? claimedDonationPreview?.longitude
        : claimPickupLocation?.lng ?? geocodedPickupPoint?.lng;

    if (!Number.isFinite(pickupLat) || !Number.isFinite(pickupLng)) {
      if (claimRecipientLocation) {
        return {
          locations: [
            {
              lat: claimRecipientLocation.latitude,
              lng: claimRecipientLocation.longitude,
              title: "Your location",
              description: "Recipient destination",
              address: "Current location",
            },
          ],
          routePath: [],
          movingMarker: null,
        };
      }
      return null;
    }

    const pickupPoint = {
      lat: pickupLat,
      lng: pickupLng,
      title: "Pickup location",
      description: latestClaim?.item_details?.name || claimedDonationPreview?.name || "Pickup point",
      address: latestClaim?.item_details?.address || claimedDonationPreview?.address || "Pickup address",
    };

    const recipientPoint =
      Number.isFinite(latestClaim?.recipient_location?.latitude) &&
      Number.isFinite(latestClaim?.recipient_location?.longitude)
        ? {
            lat: latestClaim?.recipient_location!.latitude!,
            lng: latestClaim?.recipient_location!.longitude!,
            title: "Your location",
            description: "Recipient destination",
            address: "Delivery drop-off",
          }
        : Number.isFinite(latestClaim?.recipient_latitude) && Number.isFinite(latestClaim?.recipient_longitude)
          ? {
              lat: latestClaim?.recipient_latitude!,
              lng: latestClaim?.recipient_longitude!,
              title: "Your location",
              description: "Recipient destination",
              address: "Delivery drop-off",
            }
          : claimRecipientLocation
            ? {
                lat: claimRecipientLocation.latitude,
                lng: claimRecipientLocation.longitude,
                title: "Your location",
                description: "Recipient destination",
                address: "Delivery drop-off",
              }
            : null;

    return {
      locations: recipientPoint ? [pickupPoint, recipientPoint] : [pickupPoint],
      routePath: recipientPoint ? [pickupPoint, recipientPoint] : [pickupPoint],
      movingMarker: null,
    };
  }, [latestClaim, geocodedPickupPoint, claimRecipientLocation, claimedDonationPreview, claimPickupLocation]);

  const filteredDonations = useMemo(() => {
    const needle = deferredSearch.trim().toLowerCase();

    return availableDonations
      .filter((donation) => {
        if (activeFilter === "urgent") return donation.expiry_status === "today" || donation.expiry_status === "urgent";
        if (activeFilter === "fresh") return donation.expiry_status === "fresh";
        if (activeFilter === "bulk") return donation.quantity >= 5;
        return true;
      })
      .filter((donation) => {
        if (!needle) return true;
        return [donation.name, donation.description, donation.address]
          .filter(Boolean)
          .some((value) => value.toLowerCase().includes(needle));
      })
      .sort((left, right) => computePriorityScore(right) - computePriorityScore(left));
  }, [availableDonations, activeFilter, deferredSearch]);

  const featuredDonation = filteredDonations[0];
  const spotlightDonations = filteredDonations.slice(1, 4);
  const feedDonations = filteredDonations.slice(0, 8);
  const deliveryStageIndex = latestClaim
    ? deliveryStepMeta.findIndex((step) => step.key === latestClaim.delivery_status)
    : -1;

  const isLoading = donationsQuery.isLoading || requestsQuery.isLoading || summaryQuery.isLoading;
  const compactClaims = activeClaims.slice(0, 2);

  const handleDonationSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    createDonationMutation.mutate(donationForm);
  };

  return (
    <div className="min-h-screen bg-[#f6f8fb]">
      <header className="sticky top-0 z-30 border-b border-white/70 bg-white/92 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4">
          <div className="flex items-center gap-3">
            <Link to="/" className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#ff6b35_0%,#ff8f3f_100%)] shadow-[0_12px_30px_rgba(255,107,53,0.28)]">
              <Package className="h-6 w-6 text-white" />
            </Link>
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Recipient app</p>
              <div className="flex items-center gap-2">
                <p className="text-lg font-semibold">SharePlate Express</p>
                <LiveBadge label="Live feed" />
              </div>
            </div>
          </div>

          <div className="hidden items-center gap-3 md:flex">
            <div className="rounded-2xl bg-orange-50 px-4 py-2 text-sm text-orange-700">
              Serving {user?.first_name || "you"} with fast rescue matches
            </div>
            <Button variant="outline" onClick={logout}>
              <LogOut className="mr-2 h-4 w-4" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-8 px-4 py-6">
        <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-6">
            <div className="overflow-hidden rounded-[2rem] bg-[linear-gradient(135deg,#141c2f_0%,#1f355d_45%,#2a4d83_100%)] px-6 py-7 text-white shadow-[0_30px_80px_rgba(20,28,47,0.22)]">
              <div className="space-y-3">
                <div className="space-y-3">
                  <Badge className="border-white/10 bg-white/10 text-white hover:bg-white/10">Fast rescue mode</Badge>
                  <div>
                    <h1 className="text-4xl font-semibold">Good evening, {user?.first_name || "there"}.</h1>
                    <p className="mt-2 max-w-2xl text-white/72">
                      Discover urgent meals, claim instantly, and track the full delivery journey in a format that feels more like a modern delivery app than a normal dashboard.
                    </p>
                    <div className="mt-5 flex flex-wrap gap-3">
                      <Button
                        type="button"
                        className="h-11 rounded-2xl bg-white px-5 text-[#1f355d] hover:bg-white/90"
                        onClick={() => setWorkspaceMode("rescue")}
                      >
                        Rescue meals
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-11 rounded-2xl border-white/18 bg-white/8 px-5 text-white hover:bg-white/12 hover:text-white"
                        onClick={() => setWorkspaceMode("donate")}
                      >
                        <PlusCircle className="mr-2 h-4 w-4" />
                        Post a donation
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-4">
                <div className="rounded-3xl bg-white/8 p-4">
                  <div className="text-sm text-white/68">Claims made</div>
                  <div className="mt-2 text-3xl font-semibold">{Number(summary?.claims_made || 0)}</div>
                </div>
                <div className="rounded-3xl bg-white/8 p-4">
                  <div className="text-sm text-white/68">Active claims</div>
                  <div className="mt-2 text-3xl font-semibold">{Number(summary?.active_claims || 0)}</div>
                </div>
                <div className="rounded-3xl bg-white/8 p-4">
                  <div className="text-sm text-white/68">Delivered</div>
                  <div className="mt-2 text-3xl font-semibold">{Number(summary?.delivered_claims || 0)}</div>
                </div>
                <div className="rounded-3xl bg-white/8 p-4">
                  <div className="text-sm text-white/68">Trust score</div>
                  <div className="mt-2 text-3xl font-semibold">{Number(summary?.reliability_score || 0)}%</div>
                </div>
              </div>
            </div>

            <div className="rounded-[2rem] bg-white p-4 shadow-[0_18px_60px_rgba(24,39,75,0.08)]">
              <div className="mb-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => setWorkspaceMode("rescue")}
                  className={cn(
                    "rounded-full px-4 py-2 text-sm font-medium transition",
                    workspaceMode === "rescue" ? "bg-[#111827] text-white" : "bg-[#f4f6fa] text-slate-700"
                  )}
                >
                  Rescue mode
                </button>
                <button
                  type="button"
                  onClick={() => setWorkspaceMode("donate")}
                  className={cn(
                    "rounded-full px-4 py-2 text-sm font-medium transition",
                    workspaceMode === "donate" ? "bg-[#111827] text-white" : "bg-[#f4f6fa] text-slate-700"
                  )}
                >
                  Donate mode
                </button>
              </div>
              <div className="relative">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search meals, pickup area, or quick rescue options"
                  className="h-12 rounded-2xl border-transparent bg-[#f4f6fa] pl-11 text-sm shadow-none focus-visible:ring-1"
                />
              </div>

              <div className="mt-4 flex flex-wrap gap-3">
                {filters.map((filter) => (
                  <button
                    key={filter.key}
                    type="button"
                    onClick={() => setActiveFilter(filter.key)}
                    className={cn(
                      "rounded-full px-4 py-2 text-sm font-medium transition",
                      activeFilter === filter.key
                        ? "bg-[#111827] text-white shadow-soft"
                        : "bg-[#f4f6fa] text-slate-700 hover:bg-[#ebeef5]"
                    )}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
            </div>

            {workspaceMode === "donate" && (
              <Card className="rounded-[2rem] border-none bg-white shadow-[0_18px_60px_rgba(24,39,75,0.08)]">
                <CardContent className="p-6">
                  <div className="mb-5 flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium uppercase tracking-[0.18em] text-orange-600">Donation composer</p>
                      <h2 className="mt-1 text-2xl font-semibold">Post food without leaving this screen</h2>
                      <p className="mt-2 text-sm text-muted-foreground">
                        Donation mode is enabled on your account. Post meals and they appear instantly in the rescue feed.
                      </p>
                    </div>
                    <Badge className="border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-50">
                      Live posting
                    </Badge>
                  </div>

                  <form onSubmit={handleDonationSubmit} className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="donation-name">Meal title</Label>
                      <Input
                        id="donation-name"
                        value={donationForm.name}
                        onChange={(event) => setDonationForm((current) => ({ ...current, name: event.target.value }))}
                        placeholder="Veg thali, rice bowls, packed meals"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="donation-quantity">Quantity</Label>
                      <Input
                        id="donation-quantity"
                        type="number"
                        min={1}
                        value={donationForm.quantity}
                        onChange={(event) => setDonationForm((current) => ({ ...current, quantity: Number(event.target.value) }))}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="donation-expiry">Expiry date</Label>
                      <Input
                        id="donation-expiry"
                        type="date"
                        value={donationForm.expiry_date}
                        onChange={(event) => setDonationForm((current) => ({ ...current, expiry_date: event.target.value }))}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="donation-address">Pickup address</Label>
                      <Input
                        id="donation-address"
                        value={donationForm.address}
                        onChange={(event) => setDonationForm((current) => ({ ...current, address: event.target.value }))}
                        placeholder="Sector, city, pickup point"
                        required
                      />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="donation-description">Description</Label>
                      <Textarea
                        id="donation-description"
                        rows={4}
                        value={donationForm.description}
                        onChange={(event) => setDonationForm((current) => ({ ...current, description: event.target.value }))}
                        placeholder="Mention meal type, packing details, pickup timing, or anything useful."
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-3 md:col-span-2">
                      <Button
                        type="submit"
                        className="h-11 rounded-2xl bg-[#111827] px-5 text-white hover:bg-[#1f2937]"
                        disabled={createDonationMutation.isPending}
                      >
                        {createDonationMutation.isPending ? "Posting donation..." : "Post donation now"}
                      </Button>
                      <span className="text-sm text-muted-foreground">
                        As soon as you post, it appears in the rescue feed for other users.
                      </span>
                    </div>
                  </form>
                </CardContent>
              </Card>
            )}
          </div>

          <Card className="rounded-[2rem] border-none bg-white shadow-[0_18px_60px_rgba(24,39,75,0.08)]">
            <CardContent className="p-6">
              {latestClaim ? (
                <div className="space-y-6">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium uppercase tracking-[0.18em] text-orange-600">Live delivery journey</p>
                      <h2 className="mt-2 text-2xl font-semibold">{latestClaim.item_details.name}</h2>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {latestClaim.item_details.address}
                      </p>
                    </div>
                    <Badge className="border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-50">
                      {getEtaLabel(latestClaim)}
                    </Badge>
                  </div>

                  <div className="rounded-3xl border border-orange-100 bg-[#fffaf7] p-4">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-4">
                      <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                        <Truck className="h-4 w-4 text-orange-600" />
                        Donor to recipient map
                      </div>
                      <Badge className="border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-50">
                        Claim route active
                      </Badge>
                    </div>
                    {trackingMapData ? (
                      <Map
                        locations={trackingMapData.locations}
                        routePath={trackingMapData.routePath}
                        movingMarker={trackingMapData.movingMarker}
                        routeColor="#2563eb"
                        routeGlowColor="#93c5fd"
                        routeDashArray="10 12"
                        height="280px"
                      />
                    ) : (
                      <Map
                        locations={[]}
                        center={claimRecipientLocation ? { lat: claimRecipientLocation.latitude, lng: claimRecipientLocation.longitude } : undefined}
                        routePath={[]}
                        height="280px"
                      />
                    )}
                  </div>

                  <div className="rounded-3xl bg-[#fff4ef] p-5">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-medium text-slate-600">Delivery progress</p>
                        <p className="mt-1 text-xl font-semibold">{deliveryProgress[latestClaim.delivery_status]}% complete</p>
                      </div>
                      <div className="rounded-2xl bg-white px-3 py-2 text-sm text-slate-700 shadow-soft">
                        Updated {formatDistanceToNow(new Date(latestClaim.updated_at), { addSuffix: true })}
                      </div>
                    </div>
                    <Progress value={deliveryProgress[latestClaim.delivery_status]} className="mt-4 h-2.5 bg-orange-100" />
                  </div>

                  <div className="space-y-3">
                    {deliveryStepMeta.map((step, index) => {
                      const active = index <= deliveryStageIndex;
                      const Icon = step.icon;

                      return (
                        <div key={step.key} className="flex items-start gap-3">
                          <div className={cn(
                            "flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border",
                            active
                              ? "border-orange-200 bg-orange-50 text-orange-600"
                              : "border-slate-200 bg-slate-50 text-slate-400"
                          )}>
                            <Icon className="h-4 w-4" />
                          </div>
                          <div className="flex-1 pt-1">
                            <div className="flex items-center justify-between gap-4">
                              <p className={cn("text-sm font-medium", active ? "text-slate-900" : "text-slate-400")}>{step.label}</p>
                              <span className="text-xs text-muted-foreground">{step.shortLabel}</span>
                            </div>
                            {index < deliveryStageIndex && (
                              <p className="mt-1 text-xs text-muted-foreground">Completed in the current rescue flow.</p>
                            )}
                            {index === deliveryStageIndex && (
                              <p className="mt-1 text-xs text-orange-700">This is the current live stage.</p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="flex h-full min-h-[420px] flex-col justify-between rounded-[1.75rem] bg-[linear-gradient(180deg,#fff7f3_0%,#ffffff_100%)] p-6">
                  <div>
                    <p className="text-sm font-medium uppercase tracking-[0.18em] text-orange-600">No active rescue yet</p>
                    <h2 className="mt-2 text-2xl font-semibold">Claim a meal to unlock live delivery tracking</h2>
                    <p className="mt-3 text-sm text-muted-foreground">
                      Once you claim a donation, this panel turns into a Swiggy-style live delivery journey with progress, milestones, and status updates.
                    </p>
                  </div>

                  <div className="grid gap-3">
                    <div className="rounded-3xl bg-white p-4 shadow-soft">
                      <div className="flex items-center gap-3">
                        <Sparkles className="h-5 w-5 text-orange-600" />
                        <div>
                          <p className="font-medium">Smart ranking</p>
                          <p className="text-sm text-muted-foreground">Meals are sorted by urgency, volume, and freshness.</p>
                        </div>
                      </div>
                    </div>
                    <div className="rounded-3xl bg-white p-4 shadow-soft">
                      <div className="flex items-center gap-3">
                        <Truck className="h-5 w-5 text-orange-600" />
                        <div>
                          <p className="font-medium">Faster tracking</p>
                          <p className="text-sm text-muted-foreground">Volunteer and delivery states update automatically every few seconds.</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        {featuredDonation && (
          <section className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.18em] text-orange-600">Top recommendation</p>
                <h2 className="text-2xl font-semibold">Fastest rescue pick for right now</h2>
              </div>
                    <div className="text-sm text-muted-foreground">{filteredDonations.length} meals available</div>
                  </div>
                  <DonationHeroCard donation={featuredDonation} onClaim={(donation) => claimMutation.mutate(donation)} disabled={claimMutation.isPending} />
                </section>
        )}

        <section className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-6">
            <div>
              <div className="mb-4 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium uppercase tracking-[0.18em] text-slate-500">Quick picks</p>
                  <h2 className="text-2xl font-semibold">Meals that are worth claiming fast</h2>
                </div>
              </div>

              {isLoading ? (
                <div className="grid gap-4 md:grid-cols-2">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <div key={index} className="h-48 rounded-[1.75rem] bg-white shadow-soft animate-pulse" />
                  ))}
                </div>
              ) : feedDonations.length === 0 ? (
                <Card className="rounded-[2rem] border-none bg-white shadow-soft">
                  <CardContent className="p-10 text-center text-muted-foreground">
                    No meals match this filter right now. Try another category or wait for the live feed to refresh.
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {feedDonations.map((donation, index) => (
                    <Card
                      key={donation.id}
                      className="group overflow-hidden rounded-[1.75rem] border-none bg-white shadow-[0_16px_50px_rgba(24,39,75,0.08)] transition hover:-translate-y-1 hover:shadow-[0_24px_70px_rgba(24,39,75,0.12)]"
                    >
                      <CardContent className="p-0">
                        <div className={cn(
                          "p-5 text-white",
                          index % 3 === 0 && "bg-[linear-gradient(135deg,#ff7a45_0%,#ff9b54_100%)]",
                          index % 3 === 1 && "bg-[linear-gradient(135deg,#0f766e_0%,#14b8a6_100%)]",
                          index % 3 === 2 && "bg-[linear-gradient(135deg,#1d4ed8_0%,#3b82f6_100%)]"
                        )}>
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <p className="text-xl font-semibold">{donation.name}</p>
                              <p className="mt-1 text-sm text-white/82">{donation.description || "Community-prepared meal ready for dispatch."}</p>
                            </div>
                            {donation.expiry_status && (
                              <span className="rounded-full bg-white/14 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em]">
                                {donation.expiry_status}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="space-y-4 p-5">
                          <div className="flex flex-wrap gap-2">
                            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                              {donation.quantity} portions
                            </span>
                            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                              ETA 15-20 min
                            </span>
                            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                              Score {computePriorityScore(donation) + 90}
                            </span>
                          </div>

                          <div className="space-y-2 text-sm text-muted-foreground">
                            <div className="flex items-center gap-2">
                              <MapPin className="h-4 w-4 text-primary" />
                              <span>{donation.address}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Clock3 className="h-4 w-4 text-primary" />
                              <span>Expires {donation.expiry_date}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Star className="h-4 w-4 text-primary" />
                              <span>Trusted listing with live stock sync</span>
                            </div>
                          </div>

                          <Button
                            className="h-11 w-full rounded-2xl bg-[#111827] text-white hover:bg-[#1f2937]"
                            onClick={() => claimMutation.mutate(donation)}
                            disabled={claimMutation.isPending}
                          >
                            Claim meal
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-6">
            <Card className="rounded-[2rem] border-none bg-white shadow-[0_18px_60px_rgba(24,39,75,0.08)]">
              <CardContent className="p-6">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium uppercase tracking-[0.18em] text-orange-600">Rescue spotlight</p>
                    <h2 className="mt-1 text-2xl font-semibold">Handpicked fast movers</h2>
                  </div>
                  <Sparkles className="h-5 w-5 text-orange-500" />
                </div>
                <div className="mt-5 space-y-4">
                  {spotlightDonations.length === 0 ? (
                    <p className="text-sm text-muted-foreground">More spotlight meals will appear as the feed refreshes.</p>
                  ) : (
                    spotlightDonations.map((donation) => (
                      <div key={donation.id} className="rounded-3xl bg-[#f8fafc] p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="font-semibold">{donation.name}</p>
                            <p className="mt-1 text-sm text-muted-foreground">{donation.address}</p>
                          </div>
                          <span className={cn("rounded-full border px-3 py-1 text-xs font-semibold uppercase", urgencyTone[donation.expiry_status || "fresh"])}>
                            {donation.expiry_status || "fresh"}
                          </span>
                        </div>
                        <div className="mt-3 flex items-center justify-between gap-4 text-sm">
                          <span className="text-muted-foreground">{donation.quantity} portions</span>
                          <button
                            type="button"
                            className="font-medium text-orange-600 hover:text-orange-700"
                            onClick={() => claimMutation.mutate(donation)}
                            disabled={claimMutation.isPending}
                          >
                            Claim now
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-[2rem] border-none bg-white shadow-[0_18px_60px_rgba(24,39,75,0.08)]">
              <CardContent className="p-6">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium uppercase tracking-[0.18em] text-slate-500">Recent activity</p>
                    <h2 className="mt-1 text-2xl font-semibold">Your claim history</h2>
                  </div>
                  <Users className="h-5 w-5 text-slate-500" />
                </div>
                <div className="mt-5 space-y-4">
                  {compactClaims.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No active claims right now. Delivered orders are cleared from this panel.</p>
                  ) : (
                    compactClaims.map((claim) => (
                      <div key={claim.id} className="rounded-3xl bg-[#f8fafc] p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="font-semibold">{claim.item_details.name}</p>
                            <p className="mt-1 text-sm text-muted-foreground">
                              {getEtaLabel(claim)} • {claim.item_details.quantity} portions
                            </p>
                          </div>
                          <Badge
                            className={cn(
                              "border px-3 py-1",
                              claim.delivery_status === "delivered"
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50"
                                : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-50"
                            )}
                          >
                            {claim.delivery_status}
                          </Badge>
                        </div>
                        <div className="mt-3 text-xs text-muted-foreground">
                          Updated {formatDistanceToNow(new Date(claim.updated_at), { addSuffix: true })}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </section>
      </main>
    </div>
  );
};

export default RecipientDashboard;
