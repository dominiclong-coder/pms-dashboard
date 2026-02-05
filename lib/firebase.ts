import { initializeApp } from "firebase/app";
import { getFirestore, collection, doc, setDoc, getDocs, query, orderBy, writeBatch, getDoc } from "firebase/firestore";
import { Registration, PurchaseVolumeData } from "./types";

const firebaseConfig = {
  apiKey: "AIzaSyCsq18Lx-RaMf9eWproxaKGiMd-fkIdOPY",
  authDomain: "pms-dashboard-62bc7.firebaseapp.com",
  projectId: "pms-dashboard-62bc7",
  storageBucket: "pms-dashboard-62bc7.firebasestorage.app",
  messagingSenderId: "1065957058566",
  appId: "1:1065957058566:web:6db647024140fc196ebb87"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Collection names
const COLLECTIONS = {
  WARRANTY: "warranty-claims",
  RETURN: "return-claims",
  METADATA: "metadata",
  PURCHASE_VOLUMES: "purchase-volumes"
};

// Load all registrations from Firebase
export async function loadFromFirebase(): Promise<{
  warrantyRegistrations: Registration[];
  returnRegistrations: Registration[];
  metadata: { lastUpdated: string } | null;
}> {
  try {
    // Load warranty claims
    const warrantyQuery = query(collection(db, COLLECTIONS.WARRANTY));
    const warrantySnapshot = await getDocs(warrantyQuery);
    const warrantyRegistrations = warrantySnapshot.docs.map(doc => doc.data() as Registration);

    // Load return claims
    const returnQuery = query(collection(db, COLLECTIONS.RETURN));
    const returnSnapshot = await getDocs(returnQuery);
    const returnRegistrations = returnSnapshot.docs.map(doc => doc.data() as Registration);

    // Load metadata
    const metadataSnapshot = await getDocs(collection(db, COLLECTIONS.METADATA));
    let metadata = null;
    if (!metadataSnapshot.empty) {
      metadata = metadataSnapshot.docs[0].data() as { lastUpdated: string };
    }

    return { warrantyRegistrations, returnRegistrations, metadata };
  } catch (error) {
    console.error("Error loading from Firebase:", error);
    throw error;
  }
}

// Save registrations to Firebase (used for initial load and refresh)
export async function saveToFirebase(
  registrations: Registration[],
  formSlug: string
): Promise<number> {
  const collectionName = formSlug === "warranty-claim" ? COLLECTIONS.WARRANTY : COLLECTIONS.RETURN;
  let savedCount = 0;

  // Batch writes for better performance (max 500 per batch)
  const batchSize = 500;
  for (let i = 0; i < registrations.length; i += batchSize) {
    const batch = writeBatch(db);
    const chunk = registrations.slice(i, i + batchSize);

    for (const reg of chunk) {
      const docRef = doc(db, collectionName, String(reg.id));
      batch.set(docRef, reg, { merge: true });
      savedCount++;
    }

    await batch.commit();
  }

  // Update metadata
  await setDoc(doc(db, COLLECTIONS.METADATA, "lastUpdate"), {
    lastUpdated: new Date().toISOString()
  });

  return savedCount;
}

// Get existing IDs from Firebase
export async function getExistingIds(formSlug: string): Promise<Set<string | number>> {
  const collectionName = formSlug === "warranty-claim" ? COLLECTIONS.WARRANTY : COLLECTIONS.RETURN;
  const snapshot = await getDocs(collection(db, collectionName));
  const ids = new Set<string | number>();
  snapshot.docs.forEach(doc => {
    const data = doc.data() as Registration;
    ids.add(data.id);
  });
  return ids;
}

// Load purchase volumes from Firebase
export async function loadPurchaseVolumes(): Promise<PurchaseVolumeData> {
  try {
    const docRef = doc(db, COLLECTIONS.PURCHASE_VOLUMES, "current");
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      return docSnap.data() as PurchaseVolumeData;
    }

    // Return empty data if no purchase volumes exist yet
    return {
      volumes: [],
      lastUpdated: new Date().toISOString()
    };
  } catch (error) {
    console.error("Error loading purchase volumes:", error);
    throw error;
  }
}

// Save purchase volumes to Firebase
export async function savePurchaseVolumes(data: PurchaseVolumeData): Promise<void> {
  try {
    const docRef = doc(db, COLLECTIONS.PURCHASE_VOLUMES, "current");
    await setDoc(docRef, {
      volumes: data.volumes,
      lastUpdated: new Date().toISOString()
    });
  } catch (error) {
    console.error("Error saving purchase volumes:", error);
    throw error;
  }
}

export { db, COLLECTIONS };
