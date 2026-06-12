import { showAlert } from "../../utils/showAlert";
// // src/pages/Social/ThreadHomePage.js
// import React, { useState, useEffect } from "react";
// import {
//   View,
//   Text,
//   FlatList,
//   Button,
//   ActivityIndicator,
//   TouchableOpacity,
//   StyleSheet,
// } from "react-native";
// import { fetchThreads } from "../../service/ThreadService";
// import { useNavigation } from "@react-navigation/native";

// // Dummy data (replace this with API call later)
// // const mockThreads = [
// //   { id: 1, title: "Welcome to the community!", createdBy: "Admin" },
// //   { id: 2, title: "Introduce Yourself", createdBy: "JaneDoe" },
// //   { id: 3, title: "Weekly Updates", createdBy: "Moderator" },
// // ];

// const formatDateTime = (isoDate) => {
//   const date = new Date(isoDate);
//   return date.toLocaleString(); // You can use .toLocaleDateString() if you want only date
// };

// const ThreadHomePage = () => {
//   const navigation = useNavigation();
//   const [threads, setThreads] = useState([]);
//   const [loading, setLoading] = useState(true);

//   // useEffect(() => {
//   //   // Simulate fetching threads from backend
//   //   setTimeout(() => {
//   //     setThreads(mockThreads);
//   //     setLoading(false);
//   //   }, 1000);
//   // }, []);

//   useEffect(() => {
//     const loadThreads = async () => {
//       try {
//         const data = await fetchThreads();
//         setThreads(data);
//       } catch (error) {
//         showAlert("Error", "Failed to load threads");
//       } finally {
//         setLoading(false);
//       }
//     };

//     loadThreads();
//   }, []);

//   const handleThreadPress = (thread) => {
//     // Navigate to detailed thread page (to be created)
//     navigation.navigate("ThreadDetail", { thread });
//   };

//   const handleCreateThread = () => {
//     // Navigate to create thread page (to be created)
//     navigation.navigate("CreateThread");
//   };

//   if (loading) return <ActivityIndicator size="large" color="blue" />;

//   return (
//     <View style={styles.container}>
//       <Text style={styles.header}>Threads</Text>
//       <FlatList
//         data={threads}
//         keyExtractor={(item) => item.id.toString()}
//         renderItem={({ item }) => (
//           <TouchableOpacity
//             style={styles.threadItem}
//             onPress={() => handleThreadPress(item)}
//           >
//             <Text style={styles.threadTitle}>{item.title}</Text>
//             <Text style={styles.threadMeta}>by {item.createdByName}</Text>
//           </TouchableOpacity>
//         )}
//       />
//       <Button title="Create New Thread" onPress={handleCreateThread} />
//     </View>
//   );
// };

// const styles = StyleSheet.create({
//   container: { flex: 1, padding: 16, backgroundColor: "#fff" },
//   header: { fontSize: 26, fontWeight: "bold", marginBottom: 20 },
//   threadItem: {
//     padding: 16,
//     backgroundColor: "#ffffff",
//     marginBottom: 12,
//     borderRadius: 10,
//     borderWidth: 1,
//     borderColor: "#e0e0e0",
//     shadowColor: "#000",
//     shadowOpacity: 0.05,
//     shadowRadius: 4,
//     shadowOffset: { width: 0, height: 2 },
//   },
//   threadTitle: { fontSize: 18, fontWeight: "600", marginBottom: 4 },
//   threadMeta: { fontSize: 14, color: "#666" },
// });

// export default ThreadHomePage;

// src/pages/Social/ThreadHomePage.js
import React, { useState, useEffect, useCallback, useContext } from "react";
import {
  View,
  Text,
  FlatList,
  Button,
  ActivityIndicator,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from "react-native";
import { fetchThreads } from "../../service/ThreadService";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import i18n from "../../../i18n";
import { LanguageContext } from "../../context/LanguageContext";

// Helper to format ISO date to readable format
const formatDateTime = (isoDate) => {
  const date = new Date(isoDate);
  return date.toLocaleString(); // You can use .toLocaleDateString() if you want only date
};

const ThreadHomePage = () => {
  const navigation = useNavigation();
  const [threads, setThreads] = useState([]);
  // const [loading, setLoading] = useState(true);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { language } = useContext(LanguageContext);

  // useEffect(() => {
  //   const loadThreads = async () => {
  //     try {
  //       const data = await fetchThreads();
  //       setThreads(data);
  //     } catch (error) {
  //       showAlert("Error", "Failed to load threads");
  //     } finally {
  //       setLoading(false);
  //     }
  //   };

  //   loadThreads();
  // }, []);

  function handleThreadPress(thread) {
    navigation.navigate("ThreadDetail", { thread });
  }

  const handleCreateThread = () => {
    navigation.navigate("CreateThread");
  };

  // useFocusEffect(
  //   useCallback(() => {
  //     const loadThreads = async () => {
  //       try {
  //         const data = await fetchThreads();
  //         setThreads(data);
  //       } catch (error) {
  //         showAlert("Error", "Failed to load threads");
  //       } finally {
  //         setLoading(false);
  //       }
  //     };

  //     loadThreads();
  //   }, [])
  // );

  // const loadThreads = async () => {
  //   try {
  //     setLoading(true); // <--- also show loading indicator
  //     const data = await fetchThreads();
  //     setThreads(data);
  //   } catch (error) {
  //     showAlert("Error", "Failed to load threads");
  //   } finally {
  //     setLoading(false);
  //   }
  // };

  const loadThreads = async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoadingInitial(true);
    }

    try {
      const data = await fetchThreads();
      setThreads(data);
    } catch (error) {
      showAlert(i18n.t("error"), i18n.t("loadThreadFailed"), [
        { text: i18n.t("ok") },
      ]);
    } finally {
      if (isRefresh) {
        setRefreshing(false);
      } else {
        setLoadingInitial(false);
      }
    }
  };

  useEffect(() => {
    navigation.setOptions({
      title: i18n.t("threadHome"),
      headerBackTitle: i18n.t("back"),
    });
  }, [language]);

  useEffect(() => {
    loadThreads();
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadThreads();
    }, [])
  );

  if (loadingInitial) return <ActivityIndicator size="large" color="blue" />;

  return (
    <View style={styles.container}>
      <Text style={styles.header}>{i18n.t("threads")}</Text>

      {/* <FlatList
        data={threads}
        keyExtractor={(item) => item.id.toString()}
        refreshing={refreshing}
        onRefresh={() => loadThreads(true)} // smoother pull-to-refresh
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.threadItem}
            onPress={() => handleThreadPress(item)}
          >
            <Text style={styles.threadTitle}>{item.title}</Text>
            <Text style={styles.threadContent}>
              {item.content.length > 80
                ? item.content.slice(0, 80) + "..."
                : item.content}
            </Text>
            <View style={styles.metaRow}>
              <Text style={styles.threadMeta}>by {item.createdByName}</Text>
              <Text style={styles.threadMeta}>{formatDateTime(item.createdAt)}</Text>
            </View>
          </TouchableOpacity>
        )}
      /> */}
      {threads.length === 0 ? (
        <Text
          style={{ textAlign: "center", marginVertical: 40, color: "#888" }}
        >
          {i18n.t("noThreads")}
        </Text>
      ) : (
        <FlatList
          data={threads}
          keyExtractor={(item) => item.id.toString()}
          refreshing={refreshing}
          onRefresh={() => loadThreads(true)}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.threadItem}
              onPress={() => handleThreadPress(item)}
            >
              <Text style={styles.threadTitle}>{item.title}</Text>
              <Text style={styles.threadContent}>
                {item.content.length > 80
                  ? item.content.slice(0, 80) + "..."
                  : item.content}
              </Text>
              <View style={styles.metaRow}>
                <Text style={styles.threadMeta}>
                  {i18n.t("by")} {item.createdByName}
                </Text>
                <Text style={styles.threadMeta}>
                  {formatDateTime(item.createdAt)}
                </Text>
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      {/* <Button title="Create New Thread" onPress={handleCreateThread} /> */}
      <Button
        title={i18n.t("createNewThread")}
        onPress={handleCreateThread}
        disabled={loadingInitial || refreshing}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: "#fff" },
  header: { fontSize: 26, fontWeight: "bold", marginBottom: 20 },
  threadItem: {
    padding: 16,
    backgroundColor: "#ffffff",
    marginBottom: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e0e0e0",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  threadTitle: { fontSize: 18, fontWeight: "600", marginBottom: 6 },
  threadContent: {
    fontSize: 15,
    color: "#333",
    marginBottom: 8,
    lineHeight: 23,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  threadMeta: {
    fontSize: 13,
    color: "#777",
    lineHeight: 21,
  },
});

export default ThreadHomePage;
