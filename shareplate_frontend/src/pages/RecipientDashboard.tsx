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
  Pencil,
  Search,
  ShieldCheck,
  Trash2,
  Truck,
  Users,
  PlusCircle,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

import { api, type DeliveryRequest, type DonationItem } from "@/lib/api";
import { geocodeAddress } from "@/lib/geocoding";
import { clearUserSession, getStoredUser, saveUserSession } from "@/lib/session";
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

type WorkspaceMode = "rescue" | "donate";
const STALE_ACTIVE_CLAIM_WINDOW_MS = 6 * 60 * 60 * 1000;

const deliveryStepMeta: Array<{
  key: DeliveryRequest["delivery_status"];
  label: string;
  shortLabel: string;
  icon: typeof Package;
}> = [
  { key: "pending", label: "Claim confirmed", shortLabel: "Claimed", icon: CheckCircle2 },
  { key: "assigned", label: "Delivery organizing", shortLabel: "Organizing", icon: Users },
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

const ACTIVE_DONATION_WINDOW_MS = 72 * 60 * 60 * 1000;

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
      return "Waiting for pickup";
    case "assigned":
      return "Pickup scheduled";
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
  onEdit,
  onDelete,
  isOwner,
  disabled,
  isDeleting,
}: {
  donation: DonationItem;
  onClaim: (donation: DonationItem) => void;
  onEdit: (donation: DonationItem) => void;
  onDelete: (donation: DonationItem) => void;
  isOwner: boolean;
  disabled: boolean;
  isDeleting: boolean;
}) => (
  <div className="rounded-[1.5rem] border border-orange-200 bg-[#fff7f2] p-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="space-y-3">
        <Badge className="border-orange-200 bg-white text-orange-700 hover:bg-white">Suggested</Badge>
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">{donation.name}</h2>
        </div>
      </div>
      <div className="rounded-2xl bg-white px-4 py-3 text-right">
        <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Priority</div>
        <div className="mt-1 text-2xl font-semibold text-slate-900">{computePriorityScore(donation)}</div>
      </div>
    </div>

    <div className="mt-5 grid gap-3 md:grid-cols-3">
      <div className="rounded-2xl bg-white px-4 py-3">
        <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Quantity</div>
        <div className="mt-2 text-base font-semibold text-slate-900">{donation.quantity} meals</div>
      </div>
      <div className="rounded-2xl bg-white px-4 py-3">
        <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Expiry</div>
        <div className="mt-2 text-base font-semibold capitalize text-slate-900">{donation.expiry_status || "fresh"}</div>
      </div>
      <div className="rounded-2xl bg-white px-4 py-3">
        <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Address</div>
        <div className="mt-2 text-sm font-medium text-slate-900">{donation.address}</div>
      </div>
    </div>

    <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <MapPin className="h-4 w-4" />
          {donation.address}
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <ShieldCheck className="h-4 w-4" />
          {donation.quantity} meals available
        </div>
      </div>
      {isOwner ? (
        <div className="flex flex-wrap gap-3">
          <Button type="button" variant="outline" className="h-11 rounded-xl px-5" onClick={() => onEdit(donation)}>
            <Pencil className="mr-2 h-4 w-4" />
            Edit
          </Button>
          <Button type="button" variant="outline" className="h-11 rounded-xl px-5" onClick={() => onDelete(donation)} disabled={isDeleting}>
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </Button>
        </div>
      ) : (
        <Button className="h-11 rounded-xl px-5" onClick={() => onClaim(donation)} disabled={disabled}>
          Claim meal
          <ArrowRight className="h-4 w-4" />
        </Button>
      )}
    </div>
  </div>
);

const RecipientDashboard = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = getStoredUser();
  const [isVerified, setIsVerified] = useState(user?.is_verified ?? false);

  useEffect(() => {
    if (isVerified) return;

    const interval = setInterval(async () => {
      try {
        const profile = await api.getMe();
        if (profile.is_verified) {
          setIsVerified(true);
          saveUserSession(profile);
          clearInterval(interval);
        }
      } catch (error) {
        console.error("Failed to poll profile:", error);
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [isVerified]);

  const [search, setSearch] = useState("");

  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("rescue");
  const deferredSearch = useDeferredValue(search);
  const [donationForm, setDonationForm] = useState({
    name: "",
    description: "",
    quantity: 1,
    expiry_date: "",
    address: "",
  });
  const [editingDonation, setEditingDonation] = useState<DonationItem | null>(null);
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
    mutationFn: async (payload: typeof donationForm) => {
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
      setClaimedRequestPreview(null);
      setClaimedDonationPreview(null);
      setClaimPickupLocation(null);
      toast.success(editingDonation ? "Donation updated successfully." : "Donation posted successfully. It is now live in the rescue feed.");
      setDonationForm({
        name: "",
        description: "",
        quantity: 1,
        expiry_date: "",
        address: "",
      });
      setEditingDonation(null);
      setWorkspaceMode("rescue");
      queryClient.invalidateQueries({ queryKey: ["donations"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteDonationMutation = useMutation({
    mutationFn: api.deleteDonation,
    onSuccess: () => {
      if (editingDonation) {
        setEditingDonation(null);
        setDonationForm({
          name: "",
          description: "",
          quantity: 1,
          expiry_date: "",
          address: "",
        });
      }
      toast.success("Donation deleted.");
      queryClient.invalidateQueries({ queryKey: ["donations"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const cancelClaimMutation = useMutation({
    mutationFn: api.cancelRequest,
    onSuccess: () => {
      setClaimedRequestPreview(null);
      setClaimedDonationPreview(null);
      setClaimPickupLocation(null);
      setGeocodedPickupPoint(null);
      setClaimRecipientLocation(null);
      toast.success("Claim cancelled.");
      queryClient.invalidateQueries({ queryKey: ["donations"] });
      queryClient.invalidateQueries({ queryKey: ["requests"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const logout = () => {
    clearUserSession();
    navigate("/auth?mode=login");
  };

  const availableDonations = useMemo(
    () =>
      (donationsQuery.data || []).filter((donation) => {
        const createdAtMs = new Date(donation.created_at).getTime();
        if (!Number.isFinite(createdAtMs)) {
          return false;
        }
        return Date.now() - createdAtMs <= ACTIVE_DONATION_WINDOW_MS;
      }),
    [donationsQuery.data]
  );
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
      return null;
    }

    const pickupPoint = {
      lat: pickupLat,
      lng: pickupLng,
      title: "Pickup location",
      description: latestClaim?.item_details?.name || claimedDonationPreview?.name || "Pickup point",
      address: latestClaim?.item_details?.address || claimedDonationPreview?.address || "Pickup address",
    };

    return {
      locations: [pickupPoint],
      routePath: [pickupPoint],
      movingMarker: null,
    };
  }, [latestClaim, geocodedPickupPoint, claimRecipientLocation, claimedDonationPreview, claimPickupLocation]);

  const filteredDonations = useMemo(() => {
    const needle = deferredSearch.trim().toLowerCase();

    return availableDonations
      .filter((donation) => {
        if (!needle) return true;
        return [donation.name, donation.description, donation.address]
          .filter(Boolean)
          .some((value) => value.toLowerCase().includes(needle));
      })
      .sort((left, right) => computePriorityScore(right) - computePriorityScore(left));
  }, [availableDonations, deferredSearch]);

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

  const isOwnDonation = (donation: DonationItem) => donation.donor?.id === user?.id;

  const handleEditDonation = (donation: DonationItem) => {
    setEditingDonation(donation);
    setDonationForm({
      name: donation.name,
      description: donation.description || "",
      quantity: donation.quantity,
      expiry_date: donation.expiry_date,
      address: donation.address,
    });
    setWorkspaceMode("donate");
  };

  const handleDeleteDonation = (donation: DonationItem) => {
    if (!window.confirm("Delete this donation?")) {
      return;
    }
    deleteDonationMutation.mutate(donation.id);
  };

  const handleResetDonationForm = () => {
    setEditingDonation(null);
    setDonationForm({
      name: "",
      description: "",
      quantity: 1,
      expiry_date: "",
      address: "",
    });
  };

  const canCancelClaim = latestClaim?.delivery_status === "pending" || latestClaim?.delivery_status === "assigned";

  const handleCancelClaim = () => {
    if (!latestClaim) {
      return;
    }
    if (!window.confirm("Cancel this claim?")) {
      return;
    }
    cancelClaimMutation.mutate(latestClaim.id);
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
              <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Find and claim food</p>
              <div className="flex items-center gap-2">
                <p className="text-lg font-semibold">SharePlate</p>
                <LiveBadge label="Available donations" />
              </div>
            </div>
          </div>

          <div className="hidden items-center gap-3 md:flex">
            <div className="rounded-2xl bg-orange-50 px-4 py-2 text-sm text-orange-700">
              Viewing available donations
            </div>
            <Button variant="outline" onClick={logout}>
              <LogOut className="mr-2 h-4 w-4" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-8 px-4 py-6">
        {!isVerified && (
          <div className="bg-amber-100 text-amber-800 px-4 py-3 rounded mb-4">
            Your account is pending verification. You will be able to claim donations once an admin approves your account.
          </div>
        )}
        <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-6">
            <div className="rounded-[1.5rem] bg-[#1f355d] px-6 py-7 text-white shadow-sm">
              <div className="space-y-3">
                <h1 className="text-3xl font-semibold">Hello, {user?.first_name || "there"}.</h1>
                <p className="max-w-2xl text-white/78">Browse nearby meals and track your claims.</p>
                <div className="flex flex-wrap gap-3">
                  <Button
                    type="button"
                    className="h-11 rounded-xl bg-white px-5 text-[#1f355d] hover:bg-white/90"
                    onClick={() => setWorkspaceMode("rescue")}
                  >
                    Browse meals
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 rounded-xl border-white/20 bg-transparent px-5 text-white hover:bg-white/10 hover:text-white"
                    onClick={() => setWorkspaceMode("donate")}
                  >
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Post a donation
                  </Button>
                </div>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-4">
                <div className="rounded-2xl bg-white/8 p-4">
                  <div className="text-sm text-white/68">Claims made</div>
                  <div className="mt-2 text-3xl font-semibold">{Number(summary?.claims_made || 0)}</div>
                </div>
                <div className="rounded-2xl bg-white/8 p-4">
                  <div className="text-sm text-white/68">Active claims</div>
                  <div className="mt-2 text-3xl font-semibold">{Number(summary?.active_claims || 0)}</div>
                </div>
                <div className="rounded-2xl bg-white/8 p-4">
                  <div className="text-sm text-white/68">Delivered</div>
                  <div className="mt-2 text-3xl font-semibold">{Number(summary?.delivered_claims || 0)}</div>
                </div>
                <div className="rounded-2xl bg-white/8 p-4">
                  <div className="text-sm text-white/68">Meals available</div>
                  <div className="mt-2 text-3xl font-semibold">{filteredDonations.length}</div>
                </div>
              </div>
            </div>

            <div className="rounded-[1.5rem] bg-white p-4 shadow-sm">
              <div className="mb-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => setWorkspaceMode("rescue")}
                  className={cn(
                    "rounded-full px-4 py-2 text-sm font-medium transition",
                    workspaceMode === "rescue" ? "bg-[#111827] text-white" : "bg-[#f4f6fa] text-slate-700"
                  )}
                >
                  Browse
                </button>
                <button
                  type="button"
                  onClick={() => setWorkspaceMode("donate")}
                  className={cn(
                    "rounded-full px-4 py-2 text-sm font-medium transition",
                    workspaceMode === "donate" ? "bg-[#111827] text-white" : "bg-[#f4f6fa] text-slate-700"
                  )}
                >
                  Post
                </button>
              </div>
              <div className="relative">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search meals or pickup area"
                  className="h-12 rounded-2xl border-transparent bg-[#f4f6fa] pl-11 text-sm shadow-none focus-visible:ring-1"
                />
              </div>

            </div>

            <Card className="rounded-[1.5rem] border-amber-200 bg-amber-50 shadow-none">
              <CardContent className="p-5">
                <p className="text-sm font-semibold text-amber-900">For NGOs</p>
                <p className="mt-2 text-sm leading-6 text-amber-900/90">Please confirm food quality and pickup details directly before distribution.</p>
              </CardContent>
            </Card>

            {workspaceMode === "donate" && (
              <Card className="rounded-[1.5rem] border-none bg-white shadow-sm">
                <CardContent className="p-6">
                  <div className="mb-5 flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium uppercase tracking-[0.18em] text-orange-600">Post food</p>
                      <h2 className="mt-1 text-2xl font-semibold">{editingDonation ? "Edit donation" : "Create a donation"}</h2>
                      <p className="mt-2 text-sm text-muted-foreground">{editingDonation ? "Update the details below." : "This goes live right away."}</p>
                    </div>
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
                        placeholder="Meal type, packing details, and pickup notes"
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-3 md:col-span-2">
                      <Button
                        type="submit"
                        className="h-11 rounded-2xl bg-[#111827] px-5 text-white hover:bg-[#1f2937]"
                        disabled={createDonationMutation.isPending}
                      >
                        {createDonationMutation.isPending
                          ? editingDonation
                            ? "Saving changes..."
                            : "Posting donation..."
                          : editingDonation
                            ? "Save changes"
                            : "Post donation now"}
                      </Button>
                      {editingDonation && (
                        <Button type="button" variant="outline" onClick={handleResetDonationForm}>
                          Cancel
                        </Button>
                      )}
                      <span className="text-sm text-muted-foreground">Goes live right away.</span>
                    </div>
                  </form>
                </CardContent>
              </Card>
            )}
          </div>

          <Card className="rounded-[1.5rem] border-none bg-white shadow-sm">
            <CardContent className="p-6">
              {latestClaim ? (
                <div className="space-y-6">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium uppercase tracking-[0.18em] text-orange-600">Delivery tracking</p>
                      <h2 className="mt-2 text-2xl font-semibold">{latestClaim.item_details.name}</h2>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {latestClaim.item_details.address}
                      </p>
                    </div>
                    <Badge className="border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-50">
                      {getEtaLabel(latestClaim)}
                    </Badge>
                  </div>

                  {canCancelClaim && (
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleCancelClaim}
                        disabled={cancelClaimMutation.isPending}
                      >
                        {cancelClaimMutation.isPending ? "Cancelling..." : "Cancel claim"}
                      </Button>
                    </div>
                  )}

                  <div className="rounded-3xl border border-orange-100 bg-[#fffaf7] p-4">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-4">
                      <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                        <Truck className="h-4 w-4 text-orange-600" />
                        Route map
                      </div>
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
                              <p className="mt-1 text-xs text-muted-foreground">Completed.</p>
                            )}
                            {index === deliveryStageIndex && (
                              <p className="mt-1 text-xs text-orange-700">Current step.</p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="flex h-full min-h-[420px] flex-col justify-between rounded-[1.5rem] bg-[#fff7f3] p-6">
                  <div>
                    <p className="text-sm font-medium uppercase tracking-[0.18em] text-orange-600">No active claim</p>
                    <h2 className="mt-2 text-2xl font-semibold">Claim a meal to start tracking</h2>
                    <p className="mt-3 text-sm text-muted-foreground">Track status and route updates here after you claim a meal.</p>
                  </div>

                  <div className="rounded-2xl bg-white p-4">
                    <p className="font-medium">Status updates</p>
                    <p className="mt-1 text-sm text-muted-foreground">Delivery updates refresh automatically.</p>
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
                <p className="text-sm font-medium uppercase tracking-[0.18em] text-orange-600">Suggested meal</p>
                <h2 className="text-2xl font-semibold">Available now</h2>
              </div>
                  <div className="text-sm text-muted-foreground">{filteredDonations.length} meals available</div>
                  </div>
                  <DonationHeroCard
                    donation={featuredDonation}
                    onClaim={(donation) => claimMutation.mutate(donation)}
                    onEdit={handleEditDonation}
                    onDelete={handleDeleteDonation}
                    isOwner={isOwnDonation(featuredDonation)}
                    disabled={claimMutation.isPending || !isVerified}
                    isDeleting={deleteDonationMutation.isPending}
                  />
                </section>
        )}

        <section className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-6">
            <div>
              <div className="mb-4 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium uppercase tracking-[0.18em] text-slate-500">Available donations</p>
                  <h2 className="text-2xl font-semibold">Meals near you</h2>
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
                    No meals match this filter right now. Try another category or check back soon.
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {feedDonations.map((donation) => (
                    <Card
                      key={donation.id}
                      className="group overflow-hidden rounded-[1.5rem] border bg-white shadow-sm transition hover:-translate-y-0.5"
                    >
                      <CardContent className="p-0">
                        <div className="border-b bg-[#f8fafc] p-5">
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <p className="text-xl font-semibold text-slate-900">{donation.name}</p>
                            </div>
                            {donation.expiry_status && (
                              <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-700">
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
                          </div>

                          {isOwnDonation(donation) ? (
                            <div className="flex gap-3">
                              <Button type="button" variant="outline" className="h-11 flex-1 rounded-2xl" onClick={() => handleEditDonation(donation)}>
                                <Pencil className="mr-2 h-4 w-4" />
                                Edit
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                className="h-11 flex-1 rounded-2xl"
                                onClick={() => handleDeleteDonation(donation)}
                                disabled={deleteDonationMutation.isPending}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                              </Button>
                            </div>
                          ) : (
                            <Button
                              className="h-11 w-full rounded-2xl bg-[#111827] text-white hover:bg-[#1f2937]"
                              onClick={() => claimMutation.mutate(donation)}
                              disabled={claimMutation.isPending || !isVerified}
                            >
                              Claim meal
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-6">
              <Card className="rounded-[1.5rem] border-none bg-white shadow-sm">
              <CardContent className="p-6">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium uppercase tracking-[0.18em] text-orange-600">More donations</p>
                    <h2 className="mt-1 text-2xl font-semibold">More meals nearby</h2>
                  </div>
                </div>
                <div className="mt-5 space-y-4">
                  {spotlightDonations.length === 0 ? (
                    <p className="text-sm text-muted-foreground">More meals will appear here as new donations are posted.</p>
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
                          {isOwnDonation(donation) ? (
                            <div className="flex gap-3">
                              <button
                                type="button"
                                className="font-medium text-orange-600 hover:text-orange-700"
                                onClick={() => handleEditDonation(donation)}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className="font-medium text-orange-600 hover:text-orange-700"
                                onClick={() => handleDeleteDonation(donation)}
                                disabled={deleteDonationMutation.isPending}
                              >
                                Delete
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              className="font-medium text-orange-600 hover:text-orange-700"
                              onClick={() => claimMutation.mutate(donation)}
                              disabled={claimMutation.isPending || !isVerified}
                            >
                              Claim now
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

              <Card className="rounded-[1.5rem] border-none bg-white shadow-sm">
              <CardContent className="p-6">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium uppercase tracking-[0.18em] text-slate-500">Recent activity</p>
                    <h2 className="mt-1 text-2xl font-semibold">Your claim history</h2>
                  </div>
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
