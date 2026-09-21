import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { Group, Profile } from '../types/database';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  groups: Group[];
  activeGroup: Group | null;
  loading: boolean;
  setActiveGroup: (group: Group) => void;
  refreshProfile: () => Promise<void>;
  refreshGroups: () => Promise<void>;
  createGroup: (name: string) => Promise<Group | null>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [activeGroup, setActiveGroup] = useState<Group | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchGroups = async (userProfile?: Profile | null) => {
    try {
      let query = supabase.from('groups').select('*').order('name');

      if (userProfile?.role === 'murabbi') {
        // Fetch all Usrah groups assigned to / led by this Murabbi
        query = query.eq('murabbi_id', userProfile.id);
      } else if (userProfile?.role === 'mutarabbi' && userProfile.group_id) {
        query = query.eq('id', userProfile.group_id);
      }

      const { data, error } = await query;
      if (error) {
        console.error('Error fetching groups:', error.message);
        return;
      }
      const userGroups: Group[] = data || [];
      setGroups(userGroups);

      if (userGroups.length > 0) {
        // Retain currently selected activeGroup if valid, or default to profile group or first available
        setActiveGroup((prev) => {
          if (prev && userGroups.some((g) => g.id === prev.id)) {
            return prev;
          }
          const matched = userProfile?.group_id
            ? userGroups.find((g) => g.id === userProfile.group_id)
            : null;
          return matched || userGroups[0];
        });
      }
    } catch (err) {
      console.error('Error in fetchGroups:', err);
    }
  };

  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        console.error('Error fetching profile:', error.message);
      } else {
        const userProf = data as Profile;
        setProfile(userProf);
        await fetchGroups(userProf);
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
    }
  };

  useEffect(() => {
    let isMounted = true;

    const initAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!isMounted) return;

      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        await fetchProfile(session.user.id);
      }
      setLoading(false);
    };

    initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!isMounted) return;
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        await fetchProfile(session.user.id);
      } else {
        setProfile(null);
        setGroups([]);
        setActiveGroup(null);
      }
      setLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const refreshProfile = async () => {
    if (user) await fetchProfile(user.id);
  };

  const refreshGroups = async () => {
    await fetchGroups(profile);
  };

  const createGroup = async (name: string): Promise<Group | null> => {
    if (!profile) return null;
    try {
      const trimmedName = name.trim();
      if (!trimmedName) return null;

      const { data, error } = await supabase
        .from('groups')
        .insert({
          name: trimmedName,
          murabbi_id: profile.id,
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating group:', error.message);
        throw error;
      }

      const newGroup = data as Group;

      setGroups((prev) => {
        const updated = [...prev, newGroup];
        return updated.sort((a, b) => a.name.localeCompare(b.name));
      });

      setActiveGroup(newGroup);

      if (!profile.group_id) {
        await supabase
          .from('profiles')
          .update({ group_id: newGroup.id })
          .eq('id', profile.id);
        setProfile((prev) => (prev ? { ...prev, group_id: newGroup.id } : null));
      }

      return newGroup;
    } catch (err) {
      console.error('Error in createGroup:', err);
      throw err;
    }
  };

  const signOut = async () => {
    setLoading(true);
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setProfile(null);
    setGroups([]);
    setActiveGroup(null);
    setLoading(false);
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        profile,
        groups,
        activeGroup,
        loading,
        setActiveGroup,
        refreshProfile,
        refreshGroups,
        createGroup,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);